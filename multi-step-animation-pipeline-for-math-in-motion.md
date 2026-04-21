# Multi-Step Animation Pipeline for Math in Motion

## Context

The current animation pipeline is monolithic: a single LLM call generates both the pedagogical plan AND full Manim Python code, which then gets rendered in one shot. This is fragile — the LLM must simultaneously be a pedagogy expert, Manim expert, and layout engineer. If any part of the generated code fails, the entire render fails with no recovery. There's no post-processing (transitions, audio, compositing), and Manim output IS the final product.

The goal is to decompose this into a multi-step pipeline where Manim is one step among several, with FFmpeg handling post-processing, validation catching errors before expensive renders, and a clear architecture for adding narration/TTS later.

## Pipeline Architecture

```
User Prompt
  |
  v
[1. PLAN]        LLM generates pedagogical plan + scene breakdown (no code)
  |
  v
[2. CODEGEN]     LLM generates per-scene Manim code (focused, shorter scenes)
  |
  v
[3. VALIDATE]    Static Python AST check, coordinate bounds, banned patterns
  |
  v
[4. RENDER]      Manim CLI renders each scene to MP4 (parallel, per-scene retry)
  |
  v
[5. POSTPROCESS] FFmpeg normalizes, adds transitions, title card, composites
  |
  v
[6. COMPOSE]     Final assembly — pass-through now, TTS insertion point later
  |
  v
Final MP4
```

## File Structure

```
lib/pipeline/
  types.ts              -- PipelineStage, Artifact, StageResult, PipelineManifest, PipelineEvent
  stage.ts              -- PipelineStageHandler interface, PipelineContext
  executor.ts           -- executePipeline() orchestrator with SSE event forwarding
  stages/
    plan.ts             -- Stage 1: LLM pedagogical plan (no Manim code)
    codegen.ts          -- Stage 2: LLM per-scene Manim code generation
    validate.ts         -- Stage 3: Python AST validation + coordinate checks
    render.ts           -- Stage 4: Manim CLI rendering (from manim-runner.ts)
    postprocess.ts      -- Stage 5: FFmpeg compositing & transitions
    compose.ts          -- Stage 6: Final assembly (future TTS hook)
  ffmpeg-runner.ts      -- FFmpeg CLI wrapper functions
  job-manager.ts        -- Job directory mgmt (extracted from manim-runner.ts)

app/api/pipeline/
  route.ts              -- POST: SSE stream of pipeline events
  [jobId]/route.ts      -- GET: job manifest for status polling

components/
  PipelineProgress.tsx  -- Multi-stage progress stepper (new)
```

## Implementation Phases

### Phase 1: Foundation — Types & Executor
Create the pipeline type system and async executor loop.

- **`lib/pipeline/types.ts`** — Define `PipelineStage` enum (`plan | codegen | validate | render | postprocess | compose`), `Artifact`, `StageResult`, `PipelineManifest`, `PipelineEvent` union types
- **`lib/pipeline/stage.ts`** — `PipelineStageHandler<TInput, TOutput>` interface using `AsyncGenerator` (yields progress events, returns output)
- **`lib/pipeline/executor.ts`** — `executePipeline()` runs stages sequentially, collects generator events, forwards to callback, catches per-stage errors, writes manifest to `jobs/{jobId}/manifest.json`
- **`lib/pipeline/job-manager.ts`** — Extract `ensureMediaDir`, `createJobDir`, `cleanupStaleJobs` from `lib/manim-runner.ts`

### Phase 2: Extract Existing Logic into Stages
Refactor the current monolith into pipeline stages without changing behavior yet.

- **`lib/pipeline/stages/plan.ts`** — Extract plan generation from `app/api/generate-animation/route.ts`. Split the 182-line system prompt: this stage only asks for `{ title, estimatedDuration, steps[], sceneBreakdown[] }` (no `manimCode`). New focused prompt for pedagogy only.
- **`lib/pipeline/stages/codegen.ts`** — Takes the plan + gold-standard examples, asks LLM to generate per-scene Manim code. Each scene is a self-contained `Scene` subclass (5-15 seconds). Smaller scope = fewer layout bugs.
- **`lib/pipeline/stages/validate.ts`** — New logic:
  - Python `ast.parse()` syntax check via subprocess
  - Regex scan for banned patterns (SVGMobject, ImageMobject, external files)
  - Coordinate bounds check (values outside `[-6.5, 6.5]` x `[-3.5, 3.5]`)
  - Class name verification
- **`lib/pipeline/stages/render.ts`** — Refactor `renderManimScene()` from `lib/manim-runner.ts` to render per-scene. Support parallel scene rendering (2-3 concurrent). One retry on failure with simplified code.

### Phase 3: FFmpeg Post-Processing
The biggest new capability.

- **`lib/pipeline/ffmpeg-runner.ts`** — Wrapper functions:
  - `normalizeClip()` — scale/pad to consistent resolution + fps
  - `concatenateClips()` — join scenes with crossfade transitions via `xfade` filter
  - `generateTitleCard()` — FFmpeg `lavfi` + `drawtext` for intro/outro cards
  - `addAudioTrack()` — extract from existing `mergeAudioVideo` in `manim-runner.ts:139-168`
  - `getMediaInfo()` — `ffprobe` wrapper for duration/resolution
  - `optimizeOutput()` — final H.264 encode (CRF 23)
- **`lib/pipeline/stages/postprocess.ts`** — Orchestrates: normalize all clips -> add title card -> concatenate with transitions -> optimize

### Phase 4: API & Frontend
Wire the pipeline to the UI.

- **`app/api/pipeline/route.ts`** — POST endpoint, streams `PipelineEvent` via SSE. Accepts `{ conceptText, latexProblem?, options?: { quality, skipPostProcess } }`
- **`app/api/pipeline/[jobId]/route.ts`** — GET returns manifest (for SSE reconnect/polling)
- **`lib/store.ts`** — Add pipeline state: `pipelineJobId`, `pipelineStages` (per-stage status/progress), `currentStage`. Keep existing fields for backward compat initially.
- **`components/PipelineProgress.tsx`** — Vertical stepper showing stage names, active/complete/error states, per-stage progress bars. "Retry from here" button on failures.
- **`components/AnimationPreview.tsx`** — Update to consume pipeline events alongside existing flow

### Phase 5: Scene Decomposition Prompts
Update LLM prompts to generate per-scene code instead of monolithic `Lesson` classes.

- Modify `plan.ts` system prompt to output `sceneBreakdown: { sceneId, description, mathContent, estimatedSeconds }[]`
- Modify `codegen.ts` to generate one `Scene` subclass per scene entry
- Each scene is independent: own palette setup, own objects, own cleanup

### Phase 6: Compose Stage + TTS Hook
- **`lib/pipeline/stages/compose.ts`** — Initially a pass-through. Designed as the insertion point for TTS (OpenAI TTS, ElevenLabs) and background music mixing.

## Critical Files to Modify

| File | What Changes |
|------|-------------|
| `lib/manim-runner.ts` | Extract into `stages/render.ts`, `job-manager.ts`, `ffmpeg-runner.ts`. Keep for backward compat initially. |
| `app/api/generate-animation/route.ts` | Split system prompt into plan + codegen. Keep as deprecated wrapper. |
| `lib/store.ts` | Add `pipelineJobId`, `pipelineStages`, `currentStage` state |
| `components/AnimationPreview.tsx` | Consume pipeline stage events, show multi-step progress |

## Key Design Decisions

- **No job queue (Bull/Redis)** — In-process `AsyncGenerator` gives streaming progress + cancellation without infra. Pipeline interface is async-ready for future queue swap.
- **Per-scene rendering** — Isolates failures, enables parallel rendering, makes FFmpeg transitions possible (need separate clips to crossfade).
- **Plan / codegen split** — Each LLM call has a focused prompt and simpler output. Plan call needs no Manim examples. Codegen gets structured plan as input.
- **Manim stays as math renderer** — Nothing matches it for LaTeX, geometric constructions, equation transforms. We scope it to what it's best at and let FFmpeg handle the rest.
- **No Motion Canvas / Remotion** — Both need Headless Chrome (200+ MB, slow cold start). Manim + FFmpeg are native CLI tools already on the server.

## Verification

1. Run the pipeline end-to-end with a test prompt (e.g., "Explain equivalent fractions")
2. Verify each stage produces expected artifacts in the job directory
3. Confirm FFmpeg concatenation with transitions produces a smooth final video
4. Check the frontend stepper shows real-time per-stage progress
5. Test error recovery: introduce a syntax error in one scene, confirm only that scene retries
6. Compare output quality (resolution, transitions) against current monolithic output
