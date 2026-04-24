import type { SceneIR, SceneIRAction, SceneIRObject } from "./types";

const PREMIUM_KIND_ALIASES: Record<string, string> = {
  "compound.callout_card": "compound.safe_callout",
  "compound.array_model": "compound.array_grid",
  "compound.grid_model": "compound.grid_fill",
  "compound.fraction_tiles": "compound.fraction_bar",
};

const CREATIVE_PRIMITIVES = new Set([
  "compound.pizza_ratio",
  "compound.array_grid",
  "compound.percent_grid",
  "compound.fraction_percent_board",
  "compound.misconception_panel",
  "compound.number_line_walk",
  "compound.grouped_dots",
  "compound.split_shape",
  "compound.trace_path",
  "compound.grid_fill",
  "compound.equation_ladder",
  "compound.story_stage",
  "compound.character",
  "compound.safe_callout",
  "compound.fraction_bar",
  "compound.fraction_circle",
  "compound.area_model",
  "compound.base_ten_blocks",
  "compound.clock_face",
  "compound.perimeter_trace",
  "compound.prediction_card",
  "compound.reveal_banner",
  "compound.compare_board",
  "compound.algebra_tiles",
]);

function textValue(objectSpec: SceneIRObject): string {
  const props = objectSpec.props ?? {};
  return String(props.text ?? props.title ?? props.body ?? props.tex ?? props.texString ?? props.tex_string ?? "");
}

function needsSafeTextBox(objectSpec: SceneIRObject): boolean {
  if (objectSpec.kind !== "text") return false;
  const text = textValue(objectSpec);
  const slot = objectSpec.placement?.slot ?? "";
  return text.length > 24 || ["title", "footer", "equation"].includes(slot);
}

function withSafePlacement(objectSpec: SceneIRObject): SceneIRObject {
  if (!objectSpec.placement) return objectSpec;
  return {
    ...objectSpec,
    placement: {
      align: "center",
      scaleToFit: true,
      padding: 0.14,
      ...objectSpec.placement,
      scaleToFit: objectSpec.placement.scaleToFit ?? true,
      padding: objectSpec.placement.padding ?? 0.14,
    },
  };
}

function composeObject(objectSpec: SceneIRObject): SceneIRObject {
  let next = withSafePlacement(objectSpec);
  const aliasedKind = PREMIUM_KIND_ALIASES[next.kind] ?? next.kind;
  if (aliasedKind !== next.kind) {
    next = { ...next, kind: aliasedKind };
  }

  if (needsSafeTextBox(next)) {
    next = {
      ...next,
      kind: "compound.safe_text_box",
      props: {
        ...next.props,
        text: textValue(next),
        box: false,
      },
    };
  }

  if (next.kind === "math") {
    next = {
      ...next,
      kind: "compound.safe_math_label",
      props: {
        ...next.props,
        tex: textValue(next),
      },
    };
  }

  return next;
}

function hasMotionRecipe(sceneIR: SceneIR): boolean {
  return sceneIR.beats.some((beat) =>
    beat.actions.some((action) => action.type === "recipe" || action.type === "custom" || action.type === "transform"),
  );
}

function creativeObjectIds(sceneIR: SceneIR): string[] {
  return sceneIR.objects
    .filter((objectSpec) => CREATIVE_PRIMITIVES.has(objectSpec.kind) || objectSpec.kind.startsWith("custom.factory."))
    .map((objectSpec) => objectSpec.id);
}

function addMotionPolish(sceneIR: SceneIR): SceneIR {
  if (hasMotionRecipe(sceneIR)) return sceneIR;
  const [target] = creativeObjectIds(sceneIR);
  if (!target) return sceneIR;

  const polishAction: SceneIRAction = {
    type: "recipe",
    recipe: "point",
    targets: [target],
    props: { color: "ORANGE" },
    runTime: 0.6,
  };

  const beats = sceneIR.beats.length > 1
    ? sceneIR.beats.map((beat, index) =>
        index === 1 ? { ...beat, actions: [...beat.actions, polishAction] } : beat,
      )
    : [
        ...sceneIR.beats,
        {
          id: "motion_polish",
          narration: "",
          actions: [polishAction],
          holdSeconds: 0.2,
        },
      ];

  return { ...sceneIR, beats };
}

export function composeSceneIRObjects(sceneIR: SceneIR): SceneIR {
  const objects = sceneIR.objects.map(composeObject);
  const composed = addMotionPolish({
    ...sceneIR,
    metadata: {
      ...sceneIR.metadata,
      notes: [
        ...(sceneIR.metadata.notes ?? []),
        "Object composer upgraded fragile basics to premium safe primitives.",
      ],
    },
    objects,
  });

  return composed;
}
