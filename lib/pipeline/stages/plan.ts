import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PipelineStageHandler } from "../stage";
import type {
  InteractionBlock,
  PipelineEvent,
  PipelineInput,
  PlanLayoutSlot,
  PlanMotionBeat,
  PlanObjectKind,
  PlanObjectSpec,
  PlanOutput,
  SceneEntry,
} from "../types";
import { resolveProvider, callLLM, getProviderModel } from "../llm-client";
import { mergeUsage, type LLMUsage } from "../llm-usage";
import { getPlanEstimate, recordPlanTiming } from "../job-manager";

/* ------------------------------------------------------------------ */
/*  Stage 1: Pedagogical Plan                                           */
/*                                                                      */
/*  Asks the LLM to design a lesson plan and scene breakdown.           */
/*  NO Manim code is generated here -- just structure.                  */
/* ------------------------------------------------------------------ */

const PLAN_SYSTEM_PROMPT = `You are an expert K-8 math educator and animation production designer. Your job is to plan the PEDAGOGY, VISUAL OBJECTS, PLACEMENT SLOTS, and MOTION DECISIONS for a Manim animation -- not to write code.

You MUST respond with a single JSON object matching this schema EXACTLY -- no markdown fences, no commentary outside the JSON:

{
  "title": string,
  "estimatedDuration": number,
  "steps": [
    { "label": string, "narration": "" }
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
      "mp4Bake": object | null,
      "visualBrief": string,
      "learningTarget": string,
      "objectPlan": [
        {
          "id": string,
          "kind": "text" | "math" | "shape" | "box" | "character" | "mini_animation" | "visual_model" | "custom_factory",
          "role": string,
          "visualDescription": string,
          "suggestedPrimitive": string,
          "size": "small" | "medium" | "large",
          "placement": string,
          "relatedTo": string[],
          "needsCustomFactory": boolean,
          "customFactoryReason": string | null
        }
      ],
      "layoutPlan": {
        "slots": [
          {
            "id": string,
            "purpose": string,
            "x": number,
            "y": number,
            "width": number,
            "height": number,
            "padding": number,
            "collisionPolicy": "avoid" | "allow-related-overlap" | "stack"
          }
        ]
      },
      "motionPlan": [
        {
          "id": string,
          "action": "enter" | "move" | "transform" | "emphasize" | "exit" | "hold",
          "targets": string[],
          "fromSlot": string,
          "toSlot": string,
          "path": "straight" | "arc" | "hop",
          "purpose": string,
          "durationSeconds": number
        }
      ],
      "continuity": { "keep": string[], "handoff": string },
      "acceptanceChecks": string[]
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
  "mp4Bake": object | null,       // REQUIRED for predict scenes, null otherwise
  "visualBrief": string,          // concrete visual production brief for codegen
  "learningTarget": string,       // what the learner should understand from the scene
  "objectPlan": object[],         // 3-8 named objects that codegen should build
  "layoutPlan": object,           // named placement slots before any motion is planned
  "motionPlan": object[],         // typed visual beats that move whole objects
  "continuity": object,           // what remains/hands off after the scene
  "acceptanceChecks": string[]    // machine-checkable visual quality criteria
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
  "revealNarration": string,           // legacy field name; visual reveal-card text only, not spoken narration
  "showMisconceptionCorrection": boolean,
  "misconceptionText": string | null   // the wrong answer text, or null
}

The choices must include the targetMisconception as one of the wrong choices if it exists.
The correct choice must actually be correct.

STEPS (4-8):
- Each step describes a concrete visual action: "Draw the area grid", "Highlight the numerator" -- NOT abstract goals.
- "label": short (under 10 words), concrete, describes what appears on screen.
- "narration": MUST be an empty string. This pipeline is visual-only right now. Do not write voiceover, TTS, audio, or spoken script.

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

VISUAL DECISION CHECKLIST (complete for every scene):
1. Choose the main visual metaphor.
2. Choose 3-8 named objects; every object id must be semantic and snake_case.
3. Choose layout slots BEFORE motion; object placement values must reference slot ids.
4. Choose motion paths using closed vocabulary: straight, arc, hop.
5. Identify likely layout risks in acceptanceChecks.
6. State why an object needs a custom factory; otherwise set needsCustomFactory false and customFactoryReason null.

OBJECT PLAN:
- Prefer reusable primitives or compound primitives over raw Manim.
- Use "character" for expressive guides, learners, pointing, celebrating, or misconception contrast.
- Use "mini_animation" for an object with internal motion, but move it as one whole object between slots.
- Use "custom_factory" only when built-in objects cannot describe the needed character drawing, shape cluster, box model, or mini-animation.
- suggestedPrimitive should be a supported codegen kind such as "compound.character", "compound.split_shape", "compound.grid_fill", "compound.number_line_walk", "compound.misconception_panel", "compound.story_stage", "custom.factory.<name>", "text", "math", "rectangle", or "arrow".

LAYOUT PLAN:
- Slots use Manim coordinates in the default 16:9 frame: x approximately -6.5 to 6.5, y approximately -3.5 to 3.5.
- Use stable slots like title, hero, left_model, right_model, character, equation, footer.
- Each object's placement must equal one slot id.
- Do not rely on prose like "on the left"; use slot ids and coordinates.

MOTION PLAN:
- Move whole named objects around; do not describe hand-coded object internals unless objectPlan says a custom factory is needed.
- Motion beats should align with the scene duration.
- A predict scene uses a hold beat for thinking time and visual reveal card data through interaction/mp4Bake.

PEDAGOGY:
- Build from concrete to abstract.
- Use visual models (area models, number lines, base-10 blocks, etc.) before symbolic notation.
- One concept per scene -- don't overload.
- Predict scenes MUST give students thinking time (hasPredictPause: true).
- Misconception scenes MUST show the wrong approach first in ORANGE, then correct it.
- Hook scenes should spark curiosity, not teach.
- Never include TTS, voiceover, audio, or spoken script. The legacy fields named "narration" and "revealNarration" must be empty step text or visual card text, not audio.

FEW-SHOT SCENE PATTERNS:
- Character scene: objectPlan includes mentor_character kind "character", suggestedPrimitive "compound.character", placement "character"; motionPlan has enter, move/point, hold.
- Shape/box scene: objectPlan includes fraction_box kind "visual_model", suggestedPrimitive "compound.split_shape" or "compound.grid_fill"; label attaches in a nearby equation/footer slot.
- Mini-animation scene: objectPlan includes counter_walk kind "mini_animation", suggestedPrimitive "compound.number_line_walk"; motionPlan moves it from setup_slot to result_slot via path "arc".
- Misconception scene: objectPlan includes wrong_panel and right_panel or suggestedPrimitive "compound.misconception_panel"; motionPlan emphasizes wrong first, transforms/emphasizes correct second.

estimatedDuration is the total in seconds (sum of all scene estimatedSeconds).`;

function buildUserPrompt(input: PipelineInput): string {
  const parts: string[] = [];
  if (input.conceptText) parts.push(`Concept to teach:\n${input.conceptText}`);
  if (input.latexProblem)
    parts.push(`Specific problem from a worksheet (LaTeX):\n${input.latexProblem}`);
  parts.push("Design the lesson plan and scene breakdown. Respond with JSON only.");
  return parts.join("\n\n");
}

function buildPlanRepairPrompt(raw: string): string {
  return [
    "The previous response was not parseable JSON.",
    "Convert it into one valid JSON object matching this compact schema:",
    COMPACT_PLAN_SCHEMA,
    "Preserve the intended lesson content, scene ids, visual object plans, layout slots, and motion plans when present.",
    "Return JSON only. No markdown fences. No explanation.",
    "",
    "Previous response:",
    raw.slice(0, 12000),
  ].join("\n");
}

function buildPlanRegeneratePrompt(input: PipelineInput, raw: string, parseError?: unknown): string {
  const errorText = parseError instanceof Error ? parseError.message : String(parseError ?? "unknown");
  return [
    "The previous attempt was truncated or invalid JSON.",
    "Regenerate the COMPLETE plan from scratch as one valid JSON object.",
    "Keep wording concise so the JSON finishes reliably.",
    "Prefer 4-6 scenes, 3-5 objects per scene, and 1-3 short acceptance checks per scene.",
    "Do not include markdown fences or commentary.",
    "",
    buildUserPrompt(input),
    "",
    "Use this compact schema exactly:",
    COMPACT_PLAN_SCHEMA,
    "",
    `Previous parse error: ${errorText}`,
    "",
    "Partial previous output for reference:",
    raw.slice(0, 8000),
  ].join("\n");
}

const COMPACT_PLAN_SCHEMA = `{
  "title": string,
  "estimatedDuration": number,
  "steps": [{ "label": string, "narration": "" }],
  "sceneBreakdown": [{
    "sceneId": string,
    "description": string,
    "mathContent": string,
    "estimatedSeconds": number,
    "role": "hook" | "introduce" | "worked_example" | "predict" | "address_misconception" | "synthesize",
    "hasPredictPause": boolean,
    "targetMisconception": string | null,
    "exitObjects": string[],
    "interaction": object | null,
    "mp4Bake": object | null,
    "visualBrief": string,
    "learningTarget": string,
    "objectPlan": [{
      "id": string,
      "kind": "text" | "math" | "shape" | "box" | "character" | "mini_animation" | "visual_model" | "custom_factory",
      "role": string,
      "visualDescription": string,
      "suggestedPrimitive": string,
      "size": "small" | "medium" | "large",
      "placement": string,
      "relatedTo": string[],
      "needsCustomFactory": boolean,
      "customFactoryReason": string | null
    }],
    "layoutPlan": { "slots": [{ "id": string, "purpose": string, "x": number, "y": number, "width": number, "height": number, "padding": number, "collisionPolicy": "avoid" | "allow-related-overlap" | "stack" }] },
    "motionPlan": [{ "id": string, "action": "enter" | "move" | "transform" | "emphasize" | "exit" | "hold", "targets": string[], "fromSlot": string, "toSlot": string, "path": "straight" | "arc" | "hop", "purpose": string, "durationSeconds": number }],
    "continuity": { "keep": string[], "handoff": string },
    "acceptanceChecks": string[]
  }]
}`;

const PLAN_JSON_FORMATTER_SYSTEM_PROMPT = `You are a strict JSON compiler for a math animation pipeline.
Return exactly one JSON object. No markdown. No prose. No analysis.
Use this compact schema and infer missing required values conservatively:
${COMPACT_PLAN_SCHEMA}`;

function buildPlanFormatterPrompt(input: PipelineInput, draft: string): string {
  return [
    "Convert this lesson-planning draft into valid JSON for the required schema.",
    "Keep the strongest pedagogy, visual object plans, layout slots, motion beats, custom factory needs, and acceptance checks.",
    "If the draft omitted required schema fields, infer conservative values that match the lesson.",
    "",
    buildUserPrompt(input),
    "",
    "Planning draft:",
    draft.slice(0, 12000),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/*  Validation                                                          */
/* ------------------------------------------------------------------ */

const VALID_OBJECT_KINDS: PlanObjectKind[] = [
  "text",
  "math",
  "shape",
  "box",
  "character",
  "mini_animation",
  "visual_model",
  "custom_factory",
];

const VALID_MOTION_ACTIONS = ["enter", "move", "transform", "emphasize", "exit", "hold"];
const VALID_MOTION_PATHS = ["straight", "arc", "hop"];
const VALID_COLLISION_POLICIES = ["avoid", "allow-related-overlap", "stack"];
const FORBIDDEN_AUDIO_KEYS = /(?:tts|audio|voice|voiceover|spokenScript|scriptText)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function clampNumber(value: unknown, fallback: number, min?: number, max?: number): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max ?? numberValue, Math.max(min ?? numberValue, numberValue));
}

function rejectAudioFields(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectAudioFields(entry, `${path}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_AUDIO_KEYS.test(key)) {
      throw new Error(`Plan includes forbidden audio/TTS field at ${path}.${key}.`);
    }
    rejectAudioFields(nested, `${path}.${key}`);
  }
}

function parseObjectPlan(value: unknown, sceneId: string): PlanObjectSpec[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((entry, index) => {
    const obj = isRecord(entry) ? entry : {};
    const kind = String(obj.kind ?? "visual_model");
    const safeKind = VALID_OBJECT_KINDS.includes(kind as PlanObjectKind)
      ? (kind as PlanObjectKind)
      : "visual_model";
    const id = String(obj.id ?? `${sceneId}_object_${index + 1}`)
      .trim()
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "") || `${sceneId}_object_${index + 1}`;
    const needsCustomFactory = Boolean(obj.needsCustomFactory);
    return {
      id,
      kind: safeKind,
      role: String(obj.role ?? safeKind),
      visualDescription: String(obj.visualDescription ?? obj.description ?? ""),
      suggestedPrimitive: String(obj.suggestedPrimitive ?? safeKind),
      size: obj.size === "small" || obj.size === "large" ? obj.size : "medium",
      placement: String(obj.placement ?? "hero"),
      relatedTo: stringArray(obj.relatedTo),
      needsCustomFactory,
      customFactoryReason: needsCustomFactory
        ? String(obj.customFactoryReason ?? "Built-in primitives cannot express this object.")
        : null,
    };
  });
}

function parseLayoutSlots(value: unknown): PlanLayoutSlot[] {
  const layout = isRecord(value) ? value : {};
  const slots = Array.isArray(layout.slots) ? layout.slots : [];
  return slots.map((entry, index) => {
    const slot = isRecord(entry) ? entry : {};
    const policy = String(slot.collisionPolicy ?? "avoid");
    return {
      id: String(slot.id ?? `slot_${index + 1}`),
      purpose: String(slot.purpose ?? ""),
      x: clampNumber(slot.x, 0, -6.5, 6.5),
      y: clampNumber(slot.y, 0, -3.5, 3.5),
      width: clampNumber(slot.width, 3, 0.5, 13),
      height: clampNumber(slot.height, 2, 0.5, 7),
      padding: clampNumber(slot.padding, 0.12, 0, 1),
      collisionPolicy: VALID_COLLISION_POLICIES.includes(policy)
        ? (policy as PlanLayoutSlot["collisionPolicy"])
        : "avoid",
    };
  });
}

function parseMotionPlan(value: unknown): PlanMotionBeat[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const beat = isRecord(entry) ? entry : {};
    const action = String(beat.action ?? "hold");
    const path = String(beat.path ?? "straight");
    const motion: PlanMotionBeat = {
      id: String(beat.id ?? `motion_${index + 1}`),
      action: VALID_MOTION_ACTIONS.includes(action)
        ? (action as PlanMotionBeat["action"])
        : "hold",
      targets: stringArray(beat.targets),
      purpose: String(beat.purpose ?? ""),
      durationSeconds: clampNumber(beat.durationSeconds, 0.8, 0.1, 6),
    };
    if (typeof beat.fromSlot === "string") motion.fromSlot = beat.fromSlot;
    if (typeof beat.toSlot === "string") motion.toSlot = beat.toSlot;
    if (VALID_MOTION_PATHS.includes(path)) motion.path = path as PlanMotionBeat["path"];
    return motion;
  });
}

function defaultLayoutSlots(): PlanLayoutSlot[] {
  return [
    { id: "title", purpose: "top heading lane", x: 0, y: 2.8, width: 10.8, height: 1.0, padding: 0.12, collisionPolicy: "avoid" },
    { id: "hero", purpose: "main visual model", x: 0, y: 0.35, width: 7.2, height: 3.7, padding: 0.18, collisionPolicy: "avoid" },
    { id: "left_model", purpose: "left comparison or setup", x: -3.2, y: 0.35, width: 3.8, height: 3.4, padding: 0.14, collisionPolicy: "avoid" },
    { id: "right_model", purpose: "right comparison or result", x: 3.2, y: 0.35, width: 3.8, height: 3.4, padding: 0.14, collisionPolicy: "avoid" },
    { id: "character", purpose: "guide character or learner reaction", x: -4.9, y: -2.15, width: 2.1, height: 1.7, padding: 0.1, collisionPolicy: "avoid" },
    { id: "footer", purpose: "short visual cue or takeaway", x: 0, y: -2.75, width: 10.8, height: 0.9, padding: 0.12, collisionPolicy: "avoid" },
  ];
}

function ensureVisualPlan(scene: SceneEntry): void {
  if (!scene.layoutPlan?.slots?.length) {
    scene.layoutPlan = { slots: defaultLayoutSlots() };
  }

  if (!scene.objectPlan?.length) {
    scene.objectPlan = [
      {
        id: "scene_title",
        kind: "text",
        role: "title",
        visualDescription: scene.description,
        suggestedPrimitive: "text",
        size: "medium",
        placement: "title",
        relatedTo: [],
        needsCustomFactory: false,
        customFactoryReason: null,
      },
      {
        id: "primary_model",
        kind: "visual_model",
        role: "main_math_visual",
        visualDescription: scene.visualBrief ?? scene.description,
        suggestedPrimitive: scene.mathContent ? "compound.grid_fill" : "compound.story_stage",
        size: "large",
        placement: "hero",
        relatedTo: [],
        needsCustomFactory: false,
        customFactoryReason: null,
      },
      {
        id: "visual_cue",
        kind: "text",
        role: "takeaway",
        visualDescription: scene.mathContent || scene.description,
        suggestedPrimitive: "text",
        size: "small",
        placement: "footer",
        relatedTo: ["primary_model"],
        needsCustomFactory: false,
        customFactoryReason: null,
      },
    ];
  }

  if (!scene.motionPlan?.length) {
    scene.motionPlan = [
      {
        id: "enter_primary_objects",
        action: "enter",
        targets: scene.objectPlan.map((objectSpec) => objectSpec.id),
        toSlot: "hero",
        path: "straight",
        purpose: "Bring in the named visual objects for this scene.",
        durationSeconds: Math.min(1.5, Math.max(0.8, scene.estimatedSeconds * 0.12)),
      },
      {
        id: "hold_for_reading",
        action: "hold",
        targets: scene.objectPlan.slice(0, 2).map((objectSpec) => objectSpec.id),
        purpose: "Let the viewer read and inspect the model.",
        durationSeconds: scene.hasPredictPause ? 3 : 0.8,
      },
    ];
  }

  if (!scene.acceptanceChecks?.length) {
    scene.acceptanceChecks = [
      "Every object remains inside the safe area.",
      "Named objects do not overlap unless relatedTo explains the relationship.",
      "The final frame clearly shows the main visual model and takeaway cue.",
    ];
  }
}

function stripMarkdownFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function extractFirstJsonObject(raw: string): string {
  const cleaned = stripMarkdownFence(raw);
  const start = cleaned.indexOf("{");
  if (start === -1) return cleaned;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth++;
    if (char === "}") depth--;

    if (depth === 0) {
      return cleaned.slice(start, i + 1);
    }
  }

  return cleaned.slice(start);
}

function getJsonParseError(raw: string): Error | null {
  const cleaned = extractFirstJsonObject(raw);
  try {
    JSON.parse(cleaned);
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error(String(err));
  }
}

function isLikelyTruncatedJson(raw: string, parseError?: unknown): boolean {
  const cleaned = extractFirstJsonObject(raw);
  const message = String(parseError instanceof Error ? parseError.message : parseError ?? "");
  const trimmed = cleaned.trimEnd();

  if (!trimmed) return false;
  if (/Unexpected end of JSON input|Unterminated string/i.test(message)) return true;
  if (/[{[:,]\s*$/.test(trimmed)) return true;

  let braces = 0;
  let brackets = 0;
  let inString = false;
  let escaped = false;

  for (const char of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") braces++;
    if (char === "}") braces--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
  }

  return inString || braces > 0 || brackets > 0;
}

export function parsePlanResponse(raw: string): PlanOutput {
  const cleaned = extractFirstJsonObject(raw);

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
    narration: "",
  }));

  const validRoles = ["hook", "introduce", "worked_example", "predict", "address_misconception", "synthesize"];

  const sceneBreakdown: SceneEntry[] = (p.sceneBreakdown as Record<string, unknown>[]).map(
    (s) => {
      rejectAudioFields(
        {
          objectPlan: s.objectPlan,
          layoutPlan: s.layoutPlan,
          motionPlan: s.motionPlan,
          visualBrief: s.visualBrief,
          learningTarget: s.learningTarget,
          continuity: s.continuity,
          acceptanceChecks: s.acceptanceChecks,
        },
        `sceneBreakdown[${String(s.sceneId ?? "unknown")}]`,
      );

      const sceneId = String(s.sceneId ?? "");
      const scene: SceneEntry = {
        sceneId,
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

      scene.visualBrief = String(s.visualBrief ?? scene.description);
      scene.learningTarget = String(s.learningTarget ?? scene.mathContent ?? scene.description);
      scene.objectPlan = parseObjectPlan(s.objectPlan, scene.sceneId || "scene");
      scene.layoutPlan = { slots: parseLayoutSlots(s.layoutPlan) };
      scene.motionPlan = parseMotionPlan(s.motionPlan);
      if (isRecord(s.continuity)) {
        scene.continuity = {
          keep: stringArray(s.continuity.keep),
          handoff: String(s.continuity.handoff ?? ""),
        };
      } else {
        scene.continuity = {
          keep: scene.exitObjects ?? [],
          handoff: "",
        };
      }
      scene.acceptanceChecks = stringArray(s.acceptanceChecks);
      ensureVisualPlan(scene);

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
    const model = getProviderModel(provider.provider, input.options?.model);
    const estimatedMs = getPlanEstimate(provider.provider, model);
    const usesReasonerFormatter = false;
    const retryMaxTokens = provider.provider === "deepseek" ? 48000 : 32000;

    const llmPromise = callLLM({
      systemPrompt: PLAN_SYSTEM_PROMPT,
      userPrompt,
      provider,
      model: input.options?.model,
      maxTokens: 32000,
      signal: context.signal,
    });

    let raw: string;
    let usage: LLMUsage | null = null;

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
    mkdirSync(join(context.jobDir, "llm"), { recursive: true });
    writeFileSync(join(context.jobDir, "llm", "plan.raw.txt"), raw, "utf-8");

    if (usesReasonerFormatter) {
      yield {
        type: "stage-progress",
        stage: "plan",
        progress: 0.94,
        message: "Formatting reasoned plan as JSON…",
      };

      const formatted = await callLLM({
        systemPrompt: PLAN_JSON_FORMATTER_SYSTEM_PROMPT,
        userPrompt: buildPlanFormatterPrompt(input, raw),
        provider,
        model: "deepseek-v4-flash",
        maxTokens: 32000,
        temperature: 0.2,
        signal: context.signal,
      });
      raw = formatted.text;
      writeFileSync(join(context.jobDir, "llm", "plan.formatted.txt"), raw, "utf-8");
      usage = mergeUsage(usage, formatted.usage);
      if (usage) context.lastLLMUsage = usage;
    }

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 0.95,
      message: "Parsing plan response\u2026",
    };

    let plan: PlanOutput;
    try {
      plan = parsePlanResponse(raw);
    } catch (firstError) {
      yield {
        type: "stage-progress",
        stage: "plan",
        progress: 0.97,
        message: "Repairing planner JSON…",
      };

      const repair = await callLLM({
        systemPrompt: PLAN_JSON_FORMATTER_SYSTEM_PROMPT,
        userPrompt: buildPlanRepairPrompt(raw),
        provider,
        model: provider.provider === "deepseek" ? "deepseek-v4-flash" : input.options?.model,
        maxTokens: retryMaxTokens,
        temperature: 0.2,
        signal: context.signal,
      });

      usage = mergeUsage(usage, repair.usage);
      if (usage) context.lastLLMUsage = usage;
      writeFileSync(join(context.jobDir, "llm", "plan.repair.txt"), repair.text, "utf-8");

      try {
        plan = parsePlanResponse(repair.text);
      } catch (repairError) {
        const truncated = isLikelyTruncatedJson(repair.text, getJsonParseError(repair.text))
          || isLikelyTruncatedJson(raw, getJsonParseError(raw));

        if (!truncated) {
          throw firstError;
        }

        yield {
          type: "stage-progress",
          stage: "plan",
          progress: 0.985,
          message: "Planner output was cut off. Regenerating compact JSON…",
        };

        const regenerated = await callLLM({
          systemPrompt: PLAN_JSON_FORMATTER_SYSTEM_PROMPT,
          userPrompt: buildPlanRegeneratePrompt(input, repair.text || raw, repairError),
          provider,
          model: provider.provider === "deepseek" ? "deepseek-v4-flash" : input.options?.model,
          maxTokens: retryMaxTokens,
          temperature: 0.1,
          signal: context.signal,
        });

        usage = mergeUsage(usage, regenerated.usage);
        if (usage) context.lastLLMUsage = usage;
        writeFileSync(join(context.jobDir, "llm", "plan.regenerated.txt"), regenerated.text, "utf-8");

        try {
          plan = parsePlanResponse(regenerated.text);
        } catch {
          throw firstError;
        }
      }
    }

    yield {
      type: "stage-progress",
      stage: "plan",
      progress: 1,
      message: `Plan ready: "${plan.title}" \u2014 ${plan.sceneBreakdown.length} scenes`,
    };

    return plan;
  },
};
