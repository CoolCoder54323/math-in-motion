import type { PipelineStageHandler } from "../stage";
import type { PipelineEvent, PipelineInput, PlanOutput, SceneEntry, InteractionBlock } from "../types";
import { resolveProvider, callLLM, getProviderModel } from "../llm-client";
import { getPlanEstimate, recordPlanTiming } from "../job-manager";

/* ------------------------------------------------------------------ */
/*  Stage 1: Pedagogical Plan                                           */
/*                                                                      */
/*  Asks the LLM to design a lesson plan and scene breakdown.           */
/*  NO Manim code is generated here -- just structure.                  */
/* ------------------------------------------------------------------ */

const PLAN_SYSTEM_PROMPT = `You are an expert K-8 math educator who designs animated lesson plans. Your job is to plan the STRUCTURE and PEDAGOGY of a math animation -- not to write any code.

You MUST respond with a single JSON object matching this schema EXACTLY -- no markdown fences, no commentary outside the JSON:

{
  "title": string,
  "estimatedDuration": number,
  "steps": [
    { "label": string, "narration": string }
  ],
  "sceneBreakdown": [
    {
      "sceneId": string,
      "description": string,
      "mathContent": string,
      "estimatedSeconds": number,
      "role": string,
      "hasPredictPause": boolean,
      "targetMisconception": string | null,
      "exitObjects": string[],
      "interaction": object | null,
      "mp4Bake": object | null
    }
  ]
}

Each entry in "sceneBreakdown" must follow this schema exactly:
{
  "sceneId": string,           // snake_case, descriptive (e.g. "introduce_fractions")
  "description": string,       // what the scene shows visually
  "mathContent": string,       // LaTeX or plain math expressions shown
  "estimatedSeconds": number,  // realistic duration, 6-20 seconds per scene
  "role": string,              // REQUIRED -- must be one of the closed vocabulary below
  "hasPredictPause": boolean,  // REQUIRED -- true if scene has a student-thinking pause
  "targetMisconception": string | null,  // REQUIRED -- the specific wrong answer students often give, or null
  "exitObjects": string[],     // list of object names that remain visible at scene end
  "interaction": object | null,  // REQUIRED for predict scenes, null otherwise
  "mp4Bake": object | null        // REQUIRED for predict scenes, null otherwise
}

ROLE VOCABULARY (use exactly these strings, no others):
  "hook"                    — first scene only; poses a question, no math notation yet
  "introduce"               — introduces a new concept or visual model
  "worked_example"          — shows a complete worked problem step-by-step
  "predict"                 — poses a question and waits for student to think
  "address_misconception"   — shows the WRONG approach first, then corrects it
  "synthesize"              — last scene only; summary and celebration

REQUIRED LESSON STRUCTURE RULES (violating these makes the plan invalid):
1. First scene role MUST be "hook"
2. Last scene role MUST be "synthesize"
3. At least ONE scene must have hasPredictPause: true
4. No two consecutive scenes may both have hasPredictPause: true
5. If the topic has a common wrong answer, at least one scene must have role "address_misconception"
6. estimatedSeconds must be between 5 and 25 for each scene
7. Total sum of estimatedSeconds must be between 30 and 180

For any scene with hasPredictPause: true, you MUST also include these fields:

"interaction": {
  "type": "multiple_choice",
  "prompt": string,           // ≤8 words — the question to show on screen
  "pauseSeconds": number,     // 3.0 for K-5, 2.0 for 6-8
  "choices": [
    { "text": string, "correct": false, "feedback": "explain why this is wrong in 1 sentence" },
    { "text": string, "correct": false, "feedback": "explain why this is wrong in 1 sentence" },
    { "text": string, "correct": true,  "feedback": "yes! here's why" },
    { "text": string, "correct": false, "feedback": "explain why this is wrong in 1 sentence" }
  ]
},
"mp4Bake": {
  "questionHoldSeconds": 3.0,
  "revealNarration": string,           // one sentence shown on reveal card
  "showMisconceptionCorrection": boolean,
  "misconceptionText": string | null   // the wrong answer text, or null
}

The choices must include the targetMisconception as one of the wrong choices if it exists.
The correct choice must actually be correct.

STEPS (4-8):
- Each step describes a concrete visual action: "Draw the area grid", "Highlight the numerator" -- NOT abstract goals.
- "label": short (under 10 words), concrete, describes what appears on screen.
- "narration": what a teacher says aloud. Grade-appropriate, conversational, encouraging. 1-2 sentences max.

SCENE BREAKDOWN (3-7 scenes):
- Decompose the lesson into discrete, self-contained scenes. Each scene is 5-20 seconds.
- "sceneId": short kebab-case identifier (e.g. "hook-new-concept", "area-grid", "predict-what-is-half").
- "description": what visually happens in this scene. Be specific about objects, positions, and animations.
- "mathContent": the mathematical content shown (equations, fractions, numbers). Use LaTeX notation where appropriate.
- "estimatedSeconds": how long this scene should play (5-25).
- "role": the pedagogical role this scene plays (see ROLE VOCABULARY above).
- "hasPredictPause": whether this scene includes a moment for students to think before an answer is revealed.
- "targetMisconception": the common wrong answer students give for this topic, or null if none applies.
- "exitObjects": names of Manim objects that should still be visible at the end (for continuity into the next scene).

PEDAGOGY:
- Build from concrete to abstract.
- Use visual models (area models, number lines, base-10 blocks, etc.) before symbolic notation.
- One concept per scene -- don't overload.
- Narration should guide the student's eye: "Look at the top row...", "Now watch as we shade..."
- Predict scenes MUST give students thinking time (hasPredictPause: true).
- Misconception scenes MUST show the wrong approach first in ORANGE, then correct it.
- Hook scenes should spark curiosity, not teach.

estimatedDuration is the total in seconds (sum of all scene estimatedSeconds).`;

function buildUserPrompt(input: PipelineInput): string {
  const parts: string[] = [];
  if (input.conceptText) parts.push(`Concept to teach:\n${input.conceptText}`);
  if (input.latexProblem)
    parts.push(`Specific problem from a worksheet (LaTeX):\n${input.latexProblem}`);
  parts.push("Design the lesson plan and scene breakdown. Respond with JSON only.");
  return parts.join("\n\n");
}

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

function parsePlanResponse(raw: string): PlanOutput {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error("[plan] JSON parse failed. Raw response (first 2000 chars):");
    console.error(raw.slice(0, 2000));
    console.error("[plan] Cleaned response (first 2000 chars):");
    console.error(cleaned.slice(0, 2000));
    console.error("[plan] JSON error:", err instanceof Error ? err.message : String(err));
    throw new Error("Plan stage: LLM returned invalid JSON.");
  }

  const p = parsed as Record<string, unknown>;
  if (typeof p.title !== "string" || !p.title) throw new Error("Plan missing title.");
  if (typeof p.estimatedDuration !== "number") throw new Error("Plan missing estimatedDuration.");
  if (!Array.isArray(p.steps) || p.steps.length === 0) throw new Error("Plan missing steps.");
  if (!Array.isArray(p.sceneBreakdown) || p.sceneBreakdown.length === 0)
    throw new Error("Plan missing sceneBreakdown.");

  const steps = (p.steps as Record<string, unknown>[]).map((s) => ({
    label: String(s.label ?? ""),
    narration: String(s.narration ?? ""),
  }));

  const validRoles = ["hook", "introduce", "worked_example", "predict", "address_misconception", "synthesize"];

  const sceneBreakdown: SceneEntry[] = (p.sceneBreakdown as Record<string, unknown>[]).map(
    (s) => {
      const scene: SceneEntry = {
        sceneId: String(s.sceneId ?? ""),
        description: String(s.description ?? ""),
        mathContent: String(s.mathContent ?? ""),
        estimatedSeconds: Number(s.estimatedSeconds ?? 10),
      };

      if (s.role !== undefined && s.role !== null) {
        const role = String(s.role);
        if (validRoles.includes(role)) {
          scene.role = role as SceneEntry["role"];
        }
      }

      if (s.hasPredictPause !== undefined && s.hasPredictPause !== null) {
        scene.hasPredictPause = Boolean(s.hasPredictPause);
      }

      if (s.targetMisconception !== undefined && s.targetMisconception !== null) {
        scene.targetMisconception = String(s.targetMisconception);
      }

      if (Array.isArray(s.exitObjects)) {
        scene.exitObjects = (s.exitObjects as string[]).map(String);
      }

      if (s.interaction && typeof s.interaction === "object") {
        const inter = s.interaction as Record<string, unknown>;
        scene.interaction = {
          type: String(inter.type ?? "multiple_choice") as InteractionBlock["type"],
          prompt: String(inter.prompt ?? ""),
          pauseSeconds: Number(inter.pauseSeconds ?? 3),
          choices: Array.isArray(inter.choices)
            ? (inter.choices as Record<string, unknown>[]).map((c) => ({
                text: String(c.text ?? ""),
                correct: Boolean(c.correct),
                feedback: String(c.feedback ?? ""),
              }))
            : undefined,
        };
      }

      if (s.mp4Bake && typeof s.mp4Bake === "object") {
        const bake = s.mp4Bake as Record<string, unknown>;
        scene.mp4Bake = {
          questionHoldSeconds: Number(bake.questionHoldSeconds ?? 3),
          revealNarration: String(bake.revealNarration ?? ""),
          showMisconceptionCorrection: Boolean(bake.showMisconceptionCorrection),
          misconceptionText: bake.misconceptionText ? String(bake.misconceptionText) : undefined,
        };
      }

      return scene;
    },
  );

  // Validate lesson structure rules
  if (sceneBreakdown.length > 0) {
    if (sceneBreakdown[0].role && sceneBreakdown[0].role !== "hook") {
      console.warn(`[plan] First scene role is "${sceneBreakdown[0].role}" instead of "hook" — auto-correcting to "hook"`);
      sceneBreakdown[0].role = "hook";
    }
    if (sceneBreakdown[sceneBreakdown.length - 1].role && sceneBreakdown[sceneBreakdown.length - 1].role !== "synthesize") {
      console.warn(`[plan] Last scene role is "${sceneBreakdown[sceneBreakdown.length - 1].role}" instead of "synthesize" — auto-correcting to "synthesize"`);
      sceneBreakdown[sceneBreakdown.length - 1].role = "synthesize";
    }
  }

  if (!sceneBreakdown.some((s) => s.hasPredictPause)) {
    console.warn("[plan] No scene has hasPredictPause=true — auto-setting first 'introduce' or 'worked_example' scene");
    const target = sceneBreakdown.find((s) => s.role === "introduce" || s.role === "worked_example");
    if (target) target.hasPredictPause = true;
  }

  for (let i = 1; i < sceneBreakdown.length; i++) {
    if (sceneBreakdown[i].hasPredictPause && sceneBreakdown[i - 1].hasPredictPause) {
      console.warn(`[plan] Scenes "${sceneBreakdown[i - 1].sceneId}" and "${sceneBreakdown[i].sceneId}" both have hasPredictPause — removing pause from "${sceneBreakdown[i].sceneId}"`);
      sceneBreakdown[i].hasPredictPause = false;
    }
  }

  return {
    title: p.title as string,
    estimatedDuration: p.estimatedDuration as number,
    steps,
    sceneBreakdown,
  };
}

/* ------------------------------------------------------------------ */
/*  Stage implementation                                                */
/* ------------------------------------------------------------------ */

export const planStage: PipelineStageHandler<PipelineInput, PlanOutput> = {
  name: "plan",

  async *execute(input, context): AsyncGenerator<PipelineEvent, PlanOutput, undefined> {
    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0,
      message: "Designing lesson plan\u2026",
    };

    const provider = resolveProvider(input.options);
    const userPrompt = buildUserPrompt(input);

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0.2,
      message: `Generating plan via ${provider.provider}\u2026`,
    };

    const startTime = Date.now();
    const model = getProviderModel(provider.provider);
    const estimatedMs = getPlanEstimate(provider.provider, model);

    const llmPromise = callLLM({
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userPrompt,
      provider,
      model: input.options?.model,
      maxTokens: 32000,
      signal: context.signal,
    });

    let raw: string;
    let usage: import("../llm-usage").LLMUsage | null = null;

    while (true) {
      const delay = new Promise<void>((r) => setTimeout(r, 400));
      const winner = await Promise.race([llmPromise, delay.then(() => null)]);

      if (winner !== null) {
        raw = winner.text;
        usage = winner.usage;
        break;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(0.95, 0.2 + (elapsed / estimatedMs) * 0.75);
      yield {
        type: "stage-progress",
        stage: "plan",
        progress,
        message: `Generating plan via ${provider.provider}…`,
      };
    }

    const planDurationMs = Date.now() - startTime;
    recordPlanTiming(provider.provider, model, planDurationMs, usage?.inputTokens);

    if (usage) context.lastLLMUsage = usage;

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0.95,
      message: "Parsing plan response\u2026",
    };

    const plan = parsePlanResponse(raw);

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 1,
      message: `Plan ready: "${plan.title}" \u2014 ${plan.sceneBreakdown.length} scenes`,
    };

    return plan;
  },
};
