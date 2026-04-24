import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf-8");

const types = read("lib/pipeline/types.ts");
const plan = read("lib/pipeline/stages/plan.ts");
const sceneDesign = read("lib/pipeline/scene-design.ts");
const normalizer = read("lib/pipeline/scene-normalizer.ts");
const manimKit = read("lib/pipeline/manim-kit.ts");
const customObjectAgent = read("lib/pipeline/custom-object-agent.ts");
const codegen = read("lib/pipeline/stages/codegen.ts");
const fixture = JSON.parse(read("examples/scene-ir-test/06_object_positioning_v2.json"));

assert.match(types, /export type PlanObjectSpec/, "PlanObjectSpec type should exist.");
assert.match(types, /export type SceneIRPlacement/, "SceneIRPlacement type should exist.");
assert.match(types, /type: "arrange"/, "SceneIRAction should include arrange.");
assert.match(types, /type: "attach"/, "SceneIRAction should include attach.");

assert.match(plan, /VISUAL DECISION CHECKLIST/, "Planner prompt should force explicit visual decisions.");
assert.match(plan, /"narration": MUST be an empty string/, "Planner prompt should scrap generated narration.");
assert.doesNotMatch(plan, /what a teacher says aloud/i, "Planner prompt should not ask for spoken narration.");

assert.match(sceneDesign, /Required object plan/, "Scene design prompt should consume objectPlan.");
assert.match(sceneDesign, /Required layout slots/, "Scene design prompt should consume layoutPlan slots.");
assert.match(sceneDesign, /Required motion plan/, "Scene design prompt should consume motionPlan.");
assert.match(sceneDesign, /Leave beat narration empty strings/, "Scene design should preserve visual-only output.");

assert.match(normalizer, /normalization\.anchor_to_placement/, "Normalizer should adapt anchors to placements.");
assert.match(normalizer, /Created layout slots from legacy zones/, "Normalizer should adapt zones to slots.");

assert.match(manimKit, /def resolve_placement/, "Runtime should resolve object placements.");
assert.match(manimKit, /def fit_to_slot/, "Runtime should fit objects into slots.");
assert.match(manimKit, /elif action_type == "attach"/, "Runtime should implement attach action.");
assert.match(manimKit, /elif action_type == "arrange"/, "Runtime should implement arrange action.");
assert.match(customObjectAgent, /runCustomObjectAgents/, "Pipeline should include custom object agent workers.");
assert.match(customObjectAgent, /Promise\.all/, "Custom object agents should run in parallel per scene.");
assert.match(customObjectAgent, /custom\.factory\./, "Custom object agents should produce custom factory kinds.");
assert.match(codegen, /buildCustomObjectContext/, "Scene codegen should consume custom object agent outputs.");
assert.match(codegen, /objectFactories/, "Scene codegen should merge generated factories into customBlocks.");

const sceneIR = fixture.scenes[0].sceneIR;
assert.ok(sceneIR.layout.slots.length >= 4, "Fixture should use named layout slots.");
assert.ok(sceneIR.objects.every((object) => object.placement?.slot), "Every fixture object should use placement slots.");
assert.ok(
  sceneIR.beats.some((beat) => beat.actions.some((action) => action.type === "move" && action.to?.slot)),
  "Fixture should include destination-based move action.",
);
assert.ok(
  sceneIR.beats.some((beat) => beat.actions.some((action) => action.type === "attach")),
  "Fixture should include attach action.",
);
assert.ok(
  sceneIR.beats.every((beat) => !beat.narration),
  "Fixture should be visual-only with no narration.",
);

console.log("pipeline v2 prompt/schema/runtime eval passed");
