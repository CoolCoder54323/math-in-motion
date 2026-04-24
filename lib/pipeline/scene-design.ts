import type {
  PipelineInput,
  PlanOutput,
  SceneEntry,
  SceneIR,
  SceneIRAction,
  SceneIRLayoutSlot,
  SceneRole,
} from "./types";

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
- compound.safe_text_box
- compound.safe_math_label
- compound.safe_callout
- compound.fraction_bar
- compound.fraction_circle
- compound.fraction_tiles
- compound.area_model
- compound.base_ten_blocks
- compound.clock_face
- compound.perimeter_trace
- compound.prediction_card
- compound.reveal_banner
- compound.compare_board
- compound.algebra_tiles
- custom.factory.<name>

AVAILABLE ACTIONS
- show
- hide
- transform
- emphasize
- highlight
- move: move whole named objects to a placement slot
- arrange: arrange several whole objects inside one slot as a row, column, or stack
- attach: attach labels, arrows, or braces to a target object's named port
- wait
- custom
- recipe: use named motion recipes: trace, jump, gather, split, shade, count_in, morph_to_equation, camera_focus, shade_sweep, split_and_recombine, slide_compare, mistake_crossout, answer_reveal, celebration_burst
- character recipes: bounce, nod, celebrate, point

DESIGN RULES
- Use layout slots and placements instead of hard-coded coordinates.
- Build custom objects first, then move whole objects around in animated ways.
- Individual objects can be character drawings, shape clusters, boxes, visual models, or mini animations.
- Prefer object placement refs over legacy anchors. Use anchors only for compatibility.
- Use Creative DSL compounds for the main educational visual whenever they fit.
- Use premium compounds for common K-8 math visuals. Prefer compound.fraction_bar, compound.fraction_circle, compound.area_model, compound.base_ten_blocks, compound.clock_face, compound.perimeter_trace, compound.prediction_card, compound.compare_board, or compound.safe_callout over raw shapes/text.
- Prefer recipe actions over custom Python for motion.
- Avoid compound.callout_card as the main visual unless this is a title or summary scene.
- Every non-summary scene needs a visual metaphor, a reveal sequence, a motion arc, and a memorable final frame.
- Use compound.character for friendly guides, confused learners, celebration moments, or contrast between wrong/right ideas.
- Characters should have expression, pose, and color props rather than raw hand-coded body parts.
- Use customBlocks only when the Creative DSL cannot express the idea.
- Never hand-roll text wrapping, grids, fraction shading, percent grids, clocks, base-ten blocks, perimeter traces, or labels in customBlocks. Those belong to ManimKit premium primitives.
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

function defaultSlots(): SceneIRLayoutSlot[] {
  return [
    { id: "title", x: 0, y: 2.8, width: 10.8, height: 1.0, padding: 0.12, note: "top heading lane", collisionPolicy: "avoid" },
    { id: "hero", x: 0, y: 0.35, width: 7.2, height: 3.7, padding: 0.18, note: "main demonstration slot", collisionPolicy: "avoid" },
    { id: "left_model", x: -3.2, y: 0.35, width: 3.8, height: 3.4, padding: 0.14, note: "left setup or comparison slot", collisionPolicy: "avoid" },
    { id: "right_model", x: 3.2, y: 0.35, width: 3.8, height: 3.4, padding: 0.14, note: "right result or comparison slot", collisionPolicy: "avoid" },
    { id: "character", x: -4.9, y: -2.15, width: 2.1, height: 1.7, padding: 0.1, note: "guide character slot", collisionPolicy: "avoid" },
    { id: "equation", x: 3.8, y: -2.1, width: 4.8, height: 1.2, padding: 0.12, note: "symbolic expression slot", collisionPolicy: "avoid" },
    { id: "footer", x: 0, y: -2.75, width: 10.8, height: 0.9, padding: 0.12, note: "takeaway lane", collisionPolicy: "avoid" },
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
          "coordinateSystem": { "frameWidth": number, "frameHeight": number, "unit": "manim" },
          "zones": [
            { "id": string, "x": number, "y": number, "width": number, "height": number, "note": string }
          ],
          "slots": [
            { "id": string, "x": number, "y": number, "width": number, "height": number, "padding": number, "note": string, "collisionPolicy": "avoid" | "allow-related-overlap" | "stack" }
          ],
          "continuitySlots": string[]
        },
        "objects": [
          {
            "id": string,
            "kind": string,
            "role": string,
            "placement": { "slot": string, "align": string, "scaleToFit": boolean, "padding": number, "offset": { "x": number, "y": number } },
            "ports": { "top": { "x": number, "y": number }, "bottom": { "x": number, "y": number }, "label": { "x": number, "y": number } },
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
              | { "type": "move", "targets": [string], "to": { "slot": string, "align"?: string, "scaleToFit"?: boolean, "padding"?: number, "offset"?: { "x": number, "y": number } }, "path"?: "straight" | "arc" | "hop", "avoid"?: [string], "clearance"?: number, "runTime"?: number }
              | { "type": "arrange", "targets": [string], "slot": string, "direction"?: "row" | "column" | "stack", "buff"?: number, "runTime"?: number }
              | { "type": "attach", "targets": [string], "to": string, "port"?: string, "direction"?: "UP" | "DOWN" | "LEFT" | "RIGHT", "buff"?: number, "runTime"?: number }
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
        [
          `${index + 1}. ${scene.sceneId} (${scene.role ?? "unspecified"}, ${scene.estimatedSeconds}s)`,
          `Description: ${scene.description}`,
          `Math: ${scene.mathContent}`,
          scene.visualBrief ? `Visual brief: ${scene.visualBrief}` : "",
          scene.learningTarget ? `Learning target: ${scene.learningTarget}` : "",
          scene.objectPlan?.length
            ? `Object plan: ${JSON.stringify(scene.objectPlan)}`
            : "",
          scene.layoutPlan?.slots?.length
            ? `Layout slots: ${JSON.stringify(scene.layoutPlan.slots)}`
            : "",
          scene.motionPlan?.length
            ? `Motion plan: ${JSON.stringify(scene.motionPlan)}`
            : "",
          scene.acceptanceChecks?.length
            ? `Acceptance checks: ${scene.acceptanceChecks.join("; ")}`
            : "",
        ].filter(Boolean).join("\n  "),
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
  customObjectContext?: string,
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
    scene.visualBrief ? `Visual brief: ${scene.visualBrief}` : "",
    scene.learningTarget ? `Learning target: ${scene.learningTarget}` : "",
    scene.objectPlan?.length ? `Required object plan:\n${JSON.stringify(scene.objectPlan, null, 2)}` : "",
    scene.layoutPlan?.slots?.length ? `Required layout slots:\n${JSON.stringify(scene.layoutPlan.slots, null, 2)}` : "",
    scene.motionPlan?.length ? `Required motion plan:\n${JSON.stringify(scene.motionPlan, null, 2)}` : "",
    scene.acceptanceChecks?.length ? `Acceptance checks:\n- ${scene.acceptanceChecks.join("\n- ")}` : "",
    previousScene ? `Previous scene: ${previousScene.sceneId} - ${previousScene.description}` : "",
    nextScene ? `Next scene: ${nextScene.sceneId} - ${nextScene.description}` : "",
    constraints.length > 0 ? `Constraints:\n- ${constraints.join("\n- ")}` : "",
    customObjectContext ? `Custom object agent outputs:\n${customObjectContext}` : "",
    `Default zones available:\n${JSON.stringify(defaultZones(), null, 2)}`,
    `Default slots available:\n${JSON.stringify(defaultSlots(), null, 2)}`,
    errorFeedback ? `Repair feedback from the previous attempt:\n${errorFeedback}` : "",
    "",
    "Return exactly one scene in the scenes array. Use placement.slot values that match the required layout slots. Leave beat narration empty strings. If custom object agent outputs are provided, wire those factories into sceneIR.objects and sceneIR.customBlocks.objectFactories rather than redesigning them inline.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildLessonSceneDesignPrompt(plan: PlanOutput): string {
  return [
    buildPlanContext(plan),
    "",
    `Default zones available:\n${JSON.stringify(defaultZones(), null, 2)}`,
    `Default slots available:\n${JSON.stringify(defaultSlots(), null, 2)}`,
    "",
    "Design all scenes in the lesson plan. Use the plan's objectPlan, layoutPlan, and motionPlan as binding decisions unless they are impossible. Leave beat narration empty strings.",
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
    `Default slots available:\n${JSON.stringify(defaultSlots(), null, 2)}`,
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
      coordinateSystem: { frameWidth: 13, frameHeight: 7, unit: "manim" },
      zones: defaultZones(),
      slots: scene.layoutPlan?.slots?.length
        ? scene.layoutPlan.slots.map((slot) => ({
            id: slot.id,
            x: slot.x,
            y: slot.y,
            width: slot.width,
            height: slot.height,
            padding: slot.padding,
            note: slot.purpose,
            collisionPolicy: slot.collisionPolicy,
          }))
        : defaultSlots(),
      continuitySlots: scene.exitObjects ?? [],
    },
    objects: [
      {
        id: "title",
        kind: "text",
        role: "scene_title",
        placement: { slot: "title", align: "center", scaleToFit: true, padding: 0.12 },
        anchor: { zone: "title", align: "center" },
        props: { text: sceneTitle, fontSize: 34 },
        relatedTo: [],
        zIndex: 2,
      },
      {
        id: "math",
        kind: "compound.callout_card",
        role: "math_content",
        placement: { slot: "hero", align: "center", scaleToFit: true, padding: 0.18 },
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
      coordinateSystem: { frameWidth: 13, frameHeight: 7, unit: "manim" },
      zones: defaultZones(),
      slots: defaultSlots(),
    },
    objects: [
      {
        id: "viz_title",
        kind: "text",
        role: "title",
        placement: { slot: "title", align: "center", scaleToFit: true, padding: 0.12 },
        anchor: { zone: "title", align: "center" },
        props: { text: prompt.slice(0, 80), fontSize: 32 },
        zIndex: 2,
      },
      {
        id: "viz_card",
        kind: "compound.callout_card",
        role: "hero_card",
        placement: { slot: "hero", align: "center", scaleToFit: true, padding: 0.18 },
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
      coordinateSystem: sceneIR.layout?.coordinateSystem ?? { frameWidth: 13, frameHeight: 7, unit: "manim" },
      zones: sceneIR.layout?.zones?.length ? sceneIR.layout.zones : defaultZones(),
      slots: sceneIR.layout?.slots?.length ? sceneIR.layout.slots : defaultSlots(),
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
