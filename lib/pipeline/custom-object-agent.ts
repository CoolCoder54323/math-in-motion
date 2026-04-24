import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CustomObjectAgentArtifact,
  PipelineInput,
  PlanObjectSpec,
  PlanOutput,
  SceneEntry,
} from "./types";
import { callLLM, resolveProvider, type UserPromptParts } from "./llm-client";
import { mergeUsage, type LLMUsage } from "./llm-usage";

type CustomObjectAgentResult = {
  artifacts: CustomObjectAgentArtifact[];
  usage: LLMUsage | null;
};

const CUSTOM_OBJECT_AGENT_SYSTEM_PROMPT = `You are a focused Manim custom-object specialist for a production animation pipeline.

Your only job is to design ONE reusable object factory for a single requested object.
Return strict JSON only, with no markdown fences and no commentary:

{
  "factoryName": string,
  "kind": "custom.factory.<factoryName>",
  "code": string,
  "usageNotes": string,
  "acceptanceChecks": string[]
}

The code must define a function named exactly factoryName with this signature:

def factoryName(runtime, spec):
    ...
    return mob

Factory rules:
- Use only built-in Manim primitives available from "from manim import *" and numpy as np.
- Build a clear compound object as a VGroup or VMobject family.
- Read optional configuration from props = spec.get("props") or {}.
- Keep the object centered around ORIGIN before returning it; the scene runtime handles placement and scale.
- Do not call scene.play, scene.wait, self.add, or move_to a final screen coordinate.
- Do not use external assets, SVGMobject, ImageMobject, files, network, random output, updaters, always_redraw, or ValueTracker.
- Prefer robust primitives: VGroup, Circle, Dot, Rectangle, RoundedRectangle, Square, Line, Arrow, Arc, Sector, AnnularSector, Polygon, Star, Brace, Text, MathTex.
- Make the object visually rich enough for a classroom animation, but keep it reliable and readable at small sizes.
- Expose named subgroups by adding simple attributes only when useful, e.g. mob.label = label, mob.parts = parts.
- Avoid overlap inside the object. Use arrange, next_to, explicit local coordinates, and conservative font sizes.
- Use the shared palette names when possible: BG, INK, PINK, SKY, GRASS, SUN, GRAPE, ORANGE, PANEL_BG.
`;

function factoryNameFor(objectId: string): string {
  const safe = objectId
    .trim()
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = safe || "custom_object";
  return /^[A-Za-z_]/.test(name) ? name : `custom_${name}`;
}

function buildPromptParts(params: {
  plan: PlanOutput;
  scene: SceneEntry;
  objectSpec: PlanObjectSpec;
  factoryName: string;
}): UserPromptParts {
  const { plan, scene, objectSpec, factoryName } = params;
  return {
    cacheable: [
      `Lesson title: ${plan.title}`,
      `Scene: ${scene.sceneId}`,
      `Scene role: ${scene.role ?? "unspecified"}`,
      `Scene visual brief: ${scene.visualBrief ?? scene.description}`,
      `Scene learning target: ${scene.learningTarget ?? ""}`,
      scene.layoutPlan?.slots?.length
        ? `Available layout slots: ${JSON.stringify(scene.layoutPlan.slots)}`
        : "",
      scene.acceptanceChecks?.length
        ? `Scene acceptance checks: ${scene.acceptanceChecks.join("; ")}`
        : "",
    ].filter(Boolean).join("\n"),
    variable: [
      `Create object factory for object id: ${objectSpec.id}`,
      `Required factoryName: ${factoryName}`,
      `Object kind: ${objectSpec.kind}`,
      `Object role: ${objectSpec.role}`,
      `Visual description: ${objectSpec.visualDescription}`,
      `Suggested primitive: ${objectSpec.suggestedPrimitive}`,
      `Expected size: ${objectSpec.size}`,
      `Placement slot: ${objectSpec.placement}`,
      `Related objects: ${objectSpec.relatedTo.join(", ") || "none"}`,
      objectSpec.customFactoryReason
        ? `Why this needs a custom factory: ${objectSpec.customFactoryReason}`
        : "",
      "",
      "Design this as a polished, reusable classroom-quality object.",
    ].filter(Boolean).join("\n"),
  };
}

function cleanJson(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function parseArtifact(
  raw: string,
  objectSpec: PlanObjectSpec,
  factoryName: string,
): CustomObjectAgentArtifact {
  const parsed = JSON.parse(cleanJson(raw)) as Partial<CustomObjectAgentArtifact>;
  const resolvedFactory = String(parsed.factoryName || factoryName)
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^([^A-Za-z_])/, "custom_$1");
  const code = String(parsed.code || "").trim();
  if (!code) {
    throw new Error(`Custom object agent returned empty code for ${objectSpec.id}.`);
  }
  return {
    objectId: objectSpec.id,
    factoryName: resolvedFactory,
    kind: `custom.factory.${resolvedFactory}`,
    code,
    usageNotes: String(parsed.usageNotes || ""),
    acceptanceChecks: Array.isArray(parsed.acceptanceChecks)
      ? parsed.acceptanceChecks.map(String).filter(Boolean)
      : [],
  };
}

export function selectCustomObjectSpecs(scene: SceneEntry): PlanObjectSpec[] {
  return (scene.objectPlan ?? []).filter((objectSpec) =>
    objectSpec.needsCustomFactory
      || objectSpec.kind === "custom_factory"
      || objectSpec.suggestedPrimitive.startsWith("custom.factory."),
  );
}

export async function runCustomObjectAgents(params: {
  scene: SceneEntry;
  plan: PlanOutput;
  jobDir: string;
  options?: PipelineInput["options"];
  signal?: AbortSignal;
}): Promise<CustomObjectAgentResult> {
  const objectSpecs = selectCustomObjectSpecs(params.scene);
  if (objectSpecs.length === 0) return { artifacts: [], usage: null };

  const provider = resolveProvider(params.options);
  const objectDir = join(params.jobDir, "custom-objects", params.scene.sceneId);
  mkdirSync(objectDir, { recursive: true });

  const results = await Promise.all(objectSpecs.map(async (objectSpec) => {
    const factoryName = objectSpec.suggestedPrimitive.startsWith("custom.factory.")
      ? objectSpec.suggestedPrimitive.slice("custom.factory.".length)
      : factoryNameFor(objectSpec.id);
    const response = await callLLM({
      systemPrompt: CUSTOM_OBJECT_AGENT_SYSTEM_PROMPT,
      userPrompt: buildPromptParts({
        plan: params.plan,
        scene: params.scene,
        objectSpec,
        factoryName,
      }),
      provider,
      model: params.options?.model,
      maxTokens: 6000,
      temperature: 0.2,
      signal: params.signal,
    });
    writeFileSync(join(objectDir, `${objectSpec.id}.raw.txt`), response.text, "utf-8");
    const artifact = parseArtifact(response.text, objectSpec, factoryName);
    writeFileSync(join(objectDir, `${objectSpec.id}.json`), JSON.stringify(artifact, null, 2), "utf-8");
    return { artifact, usage: response.usage };
  }));

  return {
    artifacts: results.map((result) => result.artifact),
    usage: results.reduce<LLMUsage | null>(
      (usage, result) => mergeUsage(usage, result.usage),
      null,
    ),
  };
}

export function buildCustomObjectContext(artifacts: CustomObjectAgentArtifact[]): string {
  if (artifacts.length === 0) return "";
  return [
    "Custom object agents have already produced these reusable Manim factories.",
    "Use the listed kind on the matching object in sceneIR.objects, and include/keep the code in sceneIR.customBlocks.objectFactories.",
    JSON.stringify(
      artifacts.map((artifact) => ({
        objectId: artifact.objectId,
        factoryName: artifact.factoryName,
        kind: artifact.kind,
        usageNotes: artifact.usageNotes,
        acceptanceChecks: artifact.acceptanceChecks,
        code: artifact.code,
      })),
      null,
      2,
    ),
  ].join("\n");
}
