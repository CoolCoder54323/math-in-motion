import type { PipelineInput, PlanOutput, SceneEntry, SceneIR, SceneIRAction, SceneRole } from "./types";

const CAPABILITY_CATALOG = `
AVAILABLE OBJECT KINDS
- text: plain language labels and titles
- math: MathTex expression
- rectangle, rounded_rect, circle, dot, line, arrow, brace, number_line
- compound.callout_card
- compound.asset_stage
- compound.pizza_ratio
- compound.array_grid
- compound.percent_grid
- compound.fraction_percent_board
- compound.misconception_panel
- compound.number_line_walk
- compound.grouped_dots
- compound.split_shape
- compound.trace_path
- compound.grid_fill
- compound.equation_ladder
- compound.story_stage
- compound.character
- custom.factory.<name>

AVAILABLE ACTIONS
- show
- hide
- transform
- emphasize
- highlight
- move
- wait
- custom
- recipe: use named motion recipes: trace, jump, gather, split, shade, count_in, morph_to_equation, camera_focus
- character recipes: bounce, nod, celebrate, point

DESIGN RULES
- Use zones and anchors instead of hard-coded coordinates.
- Use Creative DSL compounds for the main educational visual whenever they fit.
- Prefer recipe actions over custom Python for motion.
- Avoid compound.callout_card as the main visual unless this is a title or summary scene.
- Every non-summary scene needs a visual metaphor, a reveal sequence, a motion arc, and a memorable final frame.
- Use compound.character for friendly guides, confused learners, celebration moments, or contrast between wrong/right ideas.
- Characters should have expression, pose, and color props rather than raw hand-coded body parts.
- Use customBlocks only when the Creative DSL cannot express the idea.
- Keep objects named semantically so continuity and custom code are readable.
- Prefer 3-6 beats per scene.
- Use custom timeline blocks for cinematic or unusual animations.
`;

const ROLE_GUIDANCE: Record<SceneRole, string> = {
  hook:
    "Start with surprise or curiosity. Keep early visual load simple. End on a motivating question or striking contrast.",
  introduce:
    "Lead with the concrete visual model. Bring in notation only after the model is visible and labeled.",
  worked_example:
    "Sequence the reasoning clearly. Each beat should advance exactly one idea. Emphasize the active step.",
  predict:
    "Show the setup, then pause for student thinking time before the reveal. Reserve the answer for later beats.",
  address_misconception:
    "Show the wrong path clearly first, then correct it. Use visual contrast between wrong and right reasoning.",
  synthesize:
    "Reduce complexity. Leave the learner with the final relation, answer, and one memorable takeaway.",
};

function defaultZones() {
  return [
    { id: "title", x: 0, y: 2.8, width: 10.8, height: 1.0, note: "top heading lane" },
    { id: "hero", x: 0, y: 0.5, width: 9.8, height: 4.4, note: "main demonstration area" },
    { id: "left", x: -3.2, y: 0.4, width: 3.8, height: 3.8, note: "left support lane" },
    { id: "right", x: 3.2, y: 0.4, width: 3.8, height: 3.8, note: "right support lane" },
    { id: "footer", x: 0, y: -2.7, width: 10.8, height: 1.0, note: "summary or caption lane" },
  ];
}

const SCENE_IR_SYSTEM_PROMPT = `You are designing structured math animation scenes for a compiler-driven Manim pipeline.

Return JSON only. No markdown fences. No commentary.

The response must match this schema:
{
  "scenes": [
    {
      "sceneId": string,
      "sceneIR": {
        "metadata": {
          "sceneId": string,
          "role": "hook" | "introduce" | "worked_example" | "predict" | "address_misconception" | "synthesize",
          "visualIntent": string,
          "densityTarget": number,
          "baseClass": "Scene" | "MovingCameraScene",
          "creativeIntent": { "metaphor": string, "reveal": string, "finalFrame": string }
        },
        "layout": {
          "safeArea": { "xMin": number, "xMax": number, "yMin": number, "yMax": number },
          "zones": [
            { "id": string, "x": number, "y": number, "width": number, "height": number, "note": string }
          ],
          "continuitySlots": string[]
        },
        "objects": [
          {
            "id": string,
            "kind": string,
            "role": string,
            "anchor": { "zone": string, "align": string, "dx": number, "dy": number },
            "props": {},
            "relatedTo": string[],
            "zIndex": number
          }
        ],
        "beats": [
          {
            "id": string,
            "narration": string,
            "actions": [
              { "type": "show", "targets": [string], "animation"?: string, "runTime"?: number, "stagger"?: number }
              | { "type": "hide", "targets": [string], "animation"?: string, "runTime"?: number }
              | { "type": "transform", "from": string, "to": string, "animation"?: string, "runTime"?: number }
              | { "type": "emphasize", "targets": [string], "animation"?: string, "runTime"?: number }
              | { "type": "highlight", "targets": [string], "animation"?: string, "runTime"?: number }
              | { "type": "move", "targets": [string], "animation"?: string, "runTime"?: number }
              | { "type": "wait", "seconds": number }
              | { "type": "custom", "block": string }
              | { "type": "recipe", "recipe": string, "targets"?: [string], "props"?: {}, "runTime"?: number }
            ],
            "holdSeconds": number
          }
        ],
        "continuity": { "keep": string[] },
        "customBlocks": {
          "helpers": string,
          "objectFactories": [{ "id": string, "code": string }],
          "timeline": [{ "id": string, "code": string }],
          "updaters": [{ "id": string, "code": string }],
          "rawConstruct": string
        }
      }
    }
  ]
}

Use "rawConstruct" only if the scene truly needs mostly raw Manim. Otherwise use regular objects, beats, and timeline custom blocks.
`;

export function buildSceneDesignSystemPrompt(): string {
  return `${SCENE_IR_SYSTEM_PROMPT}\n\n${CAPABILITY_CATALOG}`;
}

function buildPlanContext(plan: PlanOutput): string {
  return [
    `Lesson title: ${plan.title}`,
    `Estimated duration: ${plan.estimatedDuration}s`,
    "Scenes:",
    ...plan.sceneBreakdown.map(
      (scene, index) =>
        `${index + 1}. ${scene.sceneId} (${scene.role ?? "unspecified"}, ${scene.estimatedSeconds}s) - ${scene.description} | Math: ${scene.mathContent}`,
    ),
  ].join("\n");
}

function sceneRoleHint(scene: SceneEntry): string {
  if (!scene.role) return "";
  return ROLE_GUIDANCE[scene.role] ?? "";
}

export function buildSingleSceneDesignPrompt(
  scene: SceneEntry,
  plan: PlanOutput,
  errorFeedback?: string,
): string {
  const sceneIndex = plan.sceneBreakdown.findIndex((entry) => entry.sceneId === scene.sceneId);
  const previousScene = sceneIndex > 0 ? plan.sceneBreakdown[sceneIndex - 1] : null;
  const nextScene = sceneIndex >= 0 && sceneIndex + 1 < plan.sceneBreakdown.length
    ? plan.sceneBreakdown[sceneIndex + 1]
    : null;

  const constraints = [
    scene.hasPredictPause ? "This scene must include a real prediction pause before revealing the answer." : "",
    scene.targetMisconception ? `Target misconception: ${scene.targetMisconception}` : "",
    scene.exitObjects?.length ? `Continuity objects to carry out: ${scene.exitObjects.join(", ")}` : "",
    sceneRoleHint(scene),
  ].filter(Boolean);

  return [
    buildPlanContext(plan),
    "",
    `Design this scene only: ${scene.sceneId}`,
    `Role: ${scene.role ?? "unspecified"}`,
    `Description: ${scene.description}`,
    `Math content: ${scene.mathContent}`,
    `Estimated seconds: ${scene.estimatedSeconds}`,
    previousScene ? `Previous scene: ${previousScene.sceneId} - ${previousScene.description}` : "",
    nextScene ? `Next scene: ${nextScene.sceneId} - ${nextScene.description}` : "",
    constraints.length > 0 ? `Constraints:\n- ${constraints.join("\n- ")}` : "",
    `Default zones available:\n${JSON.stringify(defaultZones(), null, 2)}`,
    errorFeedback ? `Repair feedback from the previous attempt:\n${errorFeedback}` : "",
    "",
    "Return exactly one scene in the scenes array.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLessonSceneDesignPrompt(plan: PlanOutput): string {
  return [
    buildPlanContext(plan),
    "",
    `Default zones available:\n${JSON.stringify(defaultZones(), null, 2)}`,
    "",
    "Design all scenes in the lesson plan.",
  ].join("\n");
}

export function buildVizSceneDesignPrompt(input: {
  conceptText?: string;
  latexProblem?: string;
}): string {
  return [
    "Design a single short visualization scene with sceneId `viz`.",
    input.conceptText ? `Concept request: ${input.conceptText}` : "",
    input.latexProblem ? `LaTeX problem: ${input.latexProblem}` : "",
    `Default zones available:\n${JSON.stringify(defaultZones(), null, 2)}`,
    "Use 4-7 beats.",
    "Use at least one Creative DSL compound and at least one recipe action.",
    "Do not use compound.callout_card as the main visual.",
    "Use one clear primary visual model. Do not add a second support model unless it occupies a separate zone and is essential.",
    "Use high-contrast text colors for the cream background: prefer INK, SKY, GRASS, ORANGE, PINK, or GRAPE. Never use WHITE, YELLOW, GRAY, or GREY for text.",
    "Keep the final frame clean: no overlapping labels, no extra duplicate fraction labels, and no object crossing through the primary model.",
    "Prefer compound.number_line_walk, compound.grouped_dots, compound.split_shape, compound.trace_path, compound.grid_fill, or compound.equation_ladder when they match the math idea.",
    "Return strict JSON. Any constants like PI, BLUE, LEFT, or ORANGE must be strings inside JSON props.",
  ]
    .filter(Boolean)
    .join("\n");
}

const JSON_CONSTANTS = [
  "PI",
  "TAU",
  "UP",
  "DOWN",
  "LEFT",
  "RIGHT",
  "ORIGIN",
  "WHITE",
  "BLACK",
  "BLUE",
  "GREEN",
  "RED",
  "YELLOW",
  "PURPLE",
  "ORANGE",
  "PINK",
  "GRAY",
  "GREY",
  "SKY",
  "GRASS",
  "SUN",
  "GRAPE",
  "INK",
  "PANEL_BG",
  "RED_ACCENT",
];

export type SceneDesignParseResult = {
  scenes: SceneIR[];
  repaired: boolean;
  repairNotes: string[];
};

function cleanSceneDesignResponse(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function repairSceneDesignJson(raw: string): { text: string; notes: string[] } {
  let text = cleanSceneDesignResponse(raw);
  const notes: string[] = [];
  const constantPattern = new RegExp(`(:\\s*)(${JSON_CONSTANTS.join("|")})(\\s*[,}\\]])`, "g");
  text = text.replace(constantPattern, (_match, prefix: string, constant: string, suffix: string) => {
    notes.push(`quoted constant ${constant}`);
    return `${prefix}"${constant}"${suffix}`;
  });
  const trailingComma = /,\s*([}\]])/g;
  if (trailingComma.test(text)) {
    notes.push("removed trailing commas");
    text = text.replace(trailingComma, "$1");
  }
  return { text, notes: Array.from(new Set(notes)) };
}

function parseSceneDesignJson(cleaned: string): SceneIR[] {
  const parsed = JSON.parse(cleaned) as { scenes?: Array<{ sceneIR?: SceneIR }> };
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("Scene design returned no scenes.");
  }
  return parsed.scenes.map((entry) => {
    if (!entry.sceneIR) {
      throw new Error("Scene design response is missing sceneIR.");
    }
    return entry.sceneIR;
  });
}

export function parseSceneDesignResponseWithDiagnostics(raw: string): SceneDesignParseResult {
  const cleaned = cleanSceneDesignResponse(raw);
  try {
    return { scenes: parseSceneDesignJson(cleaned), repaired: false, repairNotes: [] };
  } catch (initialError) {
    const repaired = repairSceneDesignJson(raw);
    try {
      return {
        scenes: parseSceneDesignJson(repaired.text),
        repaired: repaired.notes.length > 0,
        repairNotes: repaired.notes,
      };
    } catch {
      throw initialError;
    }
  }
}

export function parseSceneDesignResponse(raw: string): SceneIR[] {
  return parseSceneDesignResponseWithDiagnostics(raw).scenes;
}

export function markFallbackSceneIR(sceneIR: SceneIR, reason: string): SceneIR {
  return {
    ...sceneIR,
    metadata: {
      ...sceneIR.metadata,
      fallbackReason: reason,
      qualityStatus: "unchecked",
    },
  };
}

export function buildFallbackSceneIR(scene: SceneEntry, title?: string): SceneIR {
  const sceneTitle = scene.description || title || scene.sceneId;
  const safeRole = scene.role ?? "introduce";
  return {
    metadata: {
      sceneId: scene.sceneId,
      role: safeRole,
      visualIntent: scene.description,
      densityTarget: 0.34,
      baseClass: "Scene",
      fallbackReason: "codegen_fallback",
      qualityStatus: "unchecked",
    },
    layout: {
      safeArea: { xMin: -6.5, xMax: 6.5, yMin: -3.5, yMax: 3.5 },
      zones: defaultZones(),
      continuitySlots: scene.exitObjects ?? [],
    },
    objects: [
      {
        id: "title",
        kind: "text",
        role: "scene_title",
        anchor: { zone: "title", align: "center" },
        props: { text: sceneTitle, fontSize: 34 },
        relatedTo: [],
        zIndex: 2,
      },
      {
        id: "math",
        kind: "compound.callout_card",
        role: "math_content",
        anchor: { zone: "hero", align: "center" },
        props: {
          title: scene.mathContent || "Math idea",
          body: scene.description,
          width: 5.5,
          height: 2.4,
        },
        relatedTo: [],
        zIndex: 1,
      },
    ],
    beats: [
      {
        id: "introduce_scene",
        narration: scene.description,
        actions: [
          { type: "show", targets: ["title"], animation: "write", runTime: 0.8 },
          { type: "show", targets: ["math"], animation: "fade_in", runTime: 0.8 },
        ],
        holdSeconds: scene.hasPredictPause ? 3 : 1,
      },
      {
        id: "wrap_scene",
        narration: "",
        actions: [{ type: "emphasize", targets: ["math"], animation: "indicate", runTime: 0.6 }],
        holdSeconds: 0.4,
      },
    ],
    continuity: {
      keep: scene.exitObjects ?? [],
    },
  };
}

export function buildFallbackVizSceneIR(input: {
  conceptText?: string;
  latexProblem?: string;
}): SceneIR {
  const prompt = input.conceptText || input.latexProblem || "Visualization";
  return {
    metadata: {
      sceneId: "viz",
      role: "introduce",
      visualIntent: prompt,
      densityTarget: 0.3,
      baseClass: "Scene",
      fallbackReason: "codegen_fallback",
      qualityStatus: "unchecked",
    },
    layout: {
      safeArea: { xMin: -6.5, xMax: 6.5, yMin: -3.5, yMax: 3.5 },
      zones: defaultZones(),
    },
    objects: [
      {
        id: "viz_title",
        kind: "text",
        role: "title",
        anchor: { zone: "title", align: "center" },
        props: { text: prompt.slice(0, 80), fontSize: 32 },
        zIndex: 2,
      },
      {
        id: "viz_card",
        kind: "compound.callout_card",
        role: "hero_card",
        anchor: { zone: "hero", align: "center" },
        props: { title: "Quick visualization", body: prompt, width: 6.2, height: 2.5 },
        zIndex: 1,
      },
    ],
    beats: [
      {
        id: "show_viz",
        narration: prompt,
        actions: [
          { type: "show", targets: ["viz_title"], animation: "write", runTime: 0.7 },
          { type: "show", targets: ["viz_card"], animation: "fade_in", runTime: 0.8 },
        ],
        holdSeconds: 1.4,
      },
      {
        id: "emphasize_viz",
        narration: "",
        actions: [{ type: "emphasize", targets: ["viz_card"], animation: "indicate", runTime: 0.5 }],
        holdSeconds: 0.4,
      },
    ],
  };
}

function normalizeAction(action: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...action };

  // LLMs sometimes emit "action" instead of "type"
  if ("action" in normalized && !("type" in normalized)) {
    normalized.type = normalized.action;
    delete normalized.action;
  }

  // LLMs sometimes emit "targetId" instead of "targets" array
  if ("targetId" in normalized && !("targets" in normalized)) {
    normalized.targets = [normalized.targetId];
    delete normalized.targetId;
  }

  // LLMs sometimes emit "customCodeRef" instead of "block"
  if ("customCodeRef" in normalized && !("block" in normalized)) {
    normalized.block = normalized.customCodeRef;
    delete normalized.customCodeRef;
  }

  // LLMs sometimes emit "animType" instead of "animation"
  if ("animType" in normalized && !("animation" in normalized)) {
    normalized.animation = normalized.animType;
    delete normalized.animType;
  }

  // LLMs sometimes emit "duration" instead of "seconds" for wait
  if (normalized.type === "wait" && "duration" in normalized && !("seconds" in normalized)) {
    normalized.seconds = normalized.duration;
    delete normalized.duration;
  }

  return normalized;
}

export function enrichSceneIR(sceneIR: SceneIR): SceneIR {
  return {
    ...sceneIR,
    metadata: {
      densityTarget: 0.34,
      baseClass: "Scene",
      ...sceneIR.metadata,
    },
    layout: {
      ...sceneIR.layout,
      safeArea: sceneIR.layout?.safeArea ?? { xMin: -6.5, xMax: 6.5, yMin: -3.5, yMax: 3.5 },
      zones: sceneIR.layout?.zones?.length ? sceneIR.layout.zones : defaultZones(),
      continuitySlots: sceneIR.layout?.continuitySlots ?? [],
    },
    objects: (sceneIR.objects ?? []).map((objectSpec, index) => ({
      role: objectSpec.role ?? objectSpec.kind,
      relatedTo: objectSpec.relatedTo ?? [],
      zIndex: objectSpec.zIndex ?? index,
      ...objectSpec,
    })),
    beats: (sceneIR.beats ?? []).map((beat, index) => ({
      holdSeconds: beat.holdSeconds ?? 0,
      ...beat,
      id: beat.id || `beat_${index + 1}`,
      actions: (beat.actions ?? []).map((action) => normalizeAction(action as Record<string, unknown>) as SceneIRAction),
    })),
  };
}

export function sceneDesignOptionsFromInput(input?: PipelineInput["options"]) {
  return {
    provider: input?.provider,
    model: input?.model,
    assets: input?.assets,
  };
}
