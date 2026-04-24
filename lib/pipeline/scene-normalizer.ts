import type {
  NormalizationIssue,
  NormalizedSceneIR,
  SceneIR,
} from "./types";

type ProviderName = "anthropic" | "openai" | "deepseek" | "kimi";

const ACTION_TYPE_ALIASES: Record<string, string> = {
  fadein: "show",
  fade_in: "show",
  write: "show",
  create: "show",
  show: "show",
  fadeout: "hide",
  fade_out: "hide",
  hide: "hide",
  transform: "transform",
  replace: "transform",
  replacement: "transform",
  emphasize: "emphasize",
  highlight: "highlight",
  move: "move",
  wait: "wait",
  custom: "custom",
};

const OBJECT_KIND_ALIASES: Record<string, string> = {
  roundedRect: "rounded_rect",
  roundedRectangle: "rounded_rect",
  numberLine: "number_line",
  arrayGrid: "compound.array_grid",
  calloutCard: "compound.callout_card",
  percentGrid: "compound.percent_grid",
  "custom.factory.dot": "dot",
  "custom.factory.label": "text",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toCamelKey(key: string): string {
  return key.replace(/_([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase());
}

function normalizeKeys(
  value: unknown,
  path: string,
  issues: NormalizationIssue[],
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeKeys(item, `${path}[${index}]`, issues));
  }

  if (!isPlainObject(value)) return value;

  const normalized: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    const nextKey = toCamelKey(key);
    if (nextKey !== key) {
      issues.push({
        severity: "info",
        code: "normalization.key_renamed",
        message: `Normalized "${key}" to "${nextKey}".`,
        path: path ? `${path}.${key}` : key,
      });
    }
    normalized[nextKey] = normalizeKeys(
      nested,
      path ? `${path}.${nextKey}` : nextKey,
      issues,
    );
  }
  return normalized;
}

function parseHighlightedCell(
  value: unknown,
  path: string,
  issues: NormalizationIssue[],
): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const row = Number(value[0]);
    const col = Number(value[1]);
    if (Number.isFinite(row) && Number.isFinite(col)) {
      return [Math.trunc(row), Math.trunc(col)];
    }
  }

  if (typeof value === "string") {
    const match = value.trim().match(/^(-?\d+)\s*[:,]\s*(-?\d+)$/);
    if (match) {
      return [Number(match[1]), Number(match[2])];
    }
  }

  if (isPlainObject(value)) {
    const row = Number(value.row);
    const col = Number(value.col);
    if (Number.isFinite(row) && Number.isFinite(col)) {
      return [Math.trunc(row), Math.trunc(col)];
    }
  }

  issues.push({
    severity: "warning",
    code: "normalization.invalid_highlight",
    message: "Dropped an invalid highlighted cell entry.",
    path,
  });
  return null;
}

function normalizeArrayGridHighlights(
  sceneIR: NormalizedSceneIR,
  issues: NormalizationIssue[],
): void {
  for (const [index, objectSpec] of sceneIR.objects.entries()) {
    if (objectSpec.kind !== "compound.array_grid") continue;
    const props = objectSpec.props;
    if (!isPlainObject(props)) continue;
    const highlighted = props.highlighted;
    if (highlighted === undefined) continue;
    if (!Array.isArray(highlighted)) {
      issues.push({
        severity: "warning",
        code: "normalization.invalid_highlight_shape",
        message: "Expected highlighted cells to be an array; clearing invalid value.",
        path: `objects[${index}].props.highlighted`,
      });
      props.highlighted = [];
      continue;
    }
    props.highlighted = highlighted
      .map((entry, entryIndex) =>
        parseHighlightedCell(
          entry,
          `objects[${index}].props.highlighted[${entryIndex}]`,
          issues,
        ),
      )
      .filter((entry): entry is [number, number] => entry !== null);
  }
}

function normalizeObjectKinds(sceneIR: NormalizedSceneIR, issues: NormalizationIssue[]): void {
  for (const [index, objectSpec] of sceneIR.objects.entries()) {
    const alias = OBJECT_KIND_ALIASES[objectSpec.kind];
    if (!alias) continue;
    issues.push({
      severity: "info",
      code: "normalization.kind_alias",
      message: `Normalized object kind "${objectSpec.kind}" to "${alias}".`,
      path: `objects[${index}].kind`,
    });
    objectSpec.kind = alias;
  }
}

function normalizeActions(sceneIR: NormalizedSceneIR, issues: NormalizationIssue[]): void {
  for (const [beatIndex, beat] of sceneIR.beats.entries()) {
    if (!Array.isArray(beat.actions)) {
      issues.push({
        severity: "warning",
        code: "normalization.default_actions",
        message: "Normalized missing beat actions to an empty array.",
        path: `beats[${beatIndex}].actions`,
      });
      beat.actions = [];
      continue;
    }

    for (const [actionIndex, action] of beat.actions.entries()) {
      const actionRecord = action as unknown as Record<string, unknown>;
      if (typeof actionRecord.type === "string") {
        const canonicalKey = actionRecord.type.trim().replace(/[-\s]/g, "_").toLowerCase();
        const canonicalType = ACTION_TYPE_ALIASES[canonicalKey] ?? canonicalKey;
        if (canonicalType !== actionRecord.type) {
          issues.push({
            severity: "info",
            code: "normalization.action_alias",
            message: `Normalized action type "${actionRecord.type}" to "${canonicalType}".`,
            path: `beats[${beatIndex}].actions[${actionIndex}].type`,
          });
          actionRecord.type = canonicalType;
        }
      }

      if (!("targets" in actionRecord) && typeof actionRecord.target === "string") {
        actionRecord.targets = [actionRecord.target];
        delete actionRecord.target;
        issues.push({
          severity: "info",
          code: "normalization.target_alias",
          message: "Normalized target to targets array.",
          path: `beats[${beatIndex}].actions[${actionIndex}].target`,
        });
      }

      if (typeof actionRecord.targets === "string") {
        actionRecord.targets = [actionRecord.targets];
        issues.push({
          severity: "info",
          code: "normalization.targets_array",
          message: "Normalized string targets to an array.",
          path: `beats[${beatIndex}].actions[${actionIndex}].targets`,
        });
      }
    }
  }
}

function indentPython(source: string, spaces: number): string {
  const indent = " ".repeat(spaces);
  return source
    .split("\n")
    .map((line) => (line.trim().length === 0 ? line : `${indent}${line}`))
    .join("\n");
}

function normalizeCustomBlockId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, "_") || "custom_block";
}

function wrapTimelineCode(blockId: string, source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  const fnName = normalizeCustomBlockId(blockId);
  const exactPattern = new RegExp(`^\\s*def\\s+${fnName}\\s*\\(`, "m");
  if (exactPattern.test(trimmed)) return trimmed;
  if (/^\s*def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/m.test(trimmed)) return trimmed;

  return [
    `def ${fnName}(runtime):`,
    "    scene = runtime.scene",
    "    self = RuntimeSceneProxy(scene, runtime.registry)",
    "    objects = runtime.registry",
    "    runtime.objects = runtime.registry",
    "    self.objects = runtime.registry",
    "    for object_id, mob in runtime.registry.items():",
    "        setattr(self, object_id, mob)",
    indentPython(trimmed, 4),
  ].join("\n");
}

function wrapObjectFactoryCode(blockId: string, source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "";
  const fnName = normalizeCustomBlockId(blockId);
  const exactPattern = new RegExp(`^\\s*def\\s+${fnName}\\s*\\(`, "m");
  if (exactPattern.test(trimmed)) return trimmed;

  const definedFunctions = Array.from(trimmed.matchAll(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm));
  if (definedFunctions.length > 0) {
    const firstHelper = definedFunctions[0]?.[1];
    return [
      trimmed,
      "",
      `def ${fnName}(runtime, spec):`,
      "    scene = runtime.scene",
      "    self = RuntimeSceneProxy(scene, runtime.registry)",
      "    props = spec.get(\"props\") or {}",
      `    helper = ${firstHelper}`,
      "    argc = getattr(getattr(helper, \"__code__\", None), \"co_argcount\", 0)",
      "    if argc >= 2:",
      "        return helper(scene, props)",
      "    if argc == 1:",
      "        return helper(scene)",
      "    return helper()",
    ].join("\n");
  }

  return [
    `def ${fnName}(runtime, spec):`,
    "    scene = runtime.scene",
    "    self = RuntimeSceneProxy(scene, runtime.registry)",
    "    props = spec.get(\"props\") or {}",
    indentPython(trimmed, 4),
  ].join("\n");
}

function normalizeCustomBlocks(sceneIR: NormalizedSceneIR, issues: NormalizationIssue[]): void {
  const customBlocks = sceneIR.customBlocks;
  if (!customBlocks) return;

  for (const [index, entry] of (customBlocks.timeline ?? []).entries()) {
    const wrapped = wrapTimelineCode(entry.id, entry.code);
    if (wrapped && wrapped !== entry.code) {
      entry.code = wrapped;
      issues.push({
        severity: "info",
        code: "normalization.timeline_wrapped",
        message: `Wrapped timeline block "${entry.id}" into a runtime function.`,
        path: `customBlocks.timeline[${index}].code`,
      });
    }
  }

  for (const [index, entry] of (customBlocks.objectFactories ?? []).entries()) {
    const wrapped = wrapObjectFactoryCode(entry.id, entry.code);
    if (wrapped && wrapped !== entry.code) {
      entry.code = wrapped;
      issues.push({
        severity: "info",
        code: "normalization.object_factory_wrapped",
        message: `Wrapped object factory "${entry.id}" into a runtime-compatible function.`,
        path: `customBlocks.objectFactories[${index}].code`,
      });
    }
  }
}

export function normalizeSceneIR(
  sceneIR: SceneIR,
  provider?: ProviderName,
): NormalizedSceneIR {
  const issues: NormalizationIssue[] = [];
  const normalized = normalizeKeys(sceneIR, "", issues) as Partial<NormalizedSceneIR>;

  if (!Array.isArray(normalized.objects)) {
    issues.push({
      severity: "warning",
      code: "normalization.default_objects",
      message: "Normalized missing objects list to an empty array.",
      path: "objects",
    });
    normalized.objects = [];
  }

  if (!Array.isArray(normalized.beats)) {
    issues.push({
      severity: "warning",
      code: "normalization.default_beats",
      message: "Normalized missing beats list to an empty array.",
      path: "beats",
    });
    normalized.beats = [];
  }

  const scene = normalized as NormalizedSceneIR;
  normalizeObjectKinds(scene, issues);
  normalizeActions(scene, issues);
  normalizeArrayGridHighlights(scene, issues);
  normalizeCustomBlocks(scene, issues);
  scene.normalizationIssues = issues;
  if (provider) {
    scene.normalizedFromProvider = provider;
  }
  return scene;
}
