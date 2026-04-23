# Gallery-First Pipeline with Cloud Persistence

**Created:** 2026-04-21
**Status:** Complete

## Goal

Build a gallery-first pipeline: as soon as a prompt is submitted, the animation job is persisted to gallery.json on disk and visible in the gallery. The user can leave and come back to resume from wherever they left off. If they don't come back, the pipeline still completes and the final animation appears in the gallery automatically.

## Design Principles

- **Gallery-first**: Jobs appear in gallery immediately on `pipeline-started`, not just on completion
- **Cloud persistence**: Gallery entries track status (`generating`, `awaiting-approval`, `building`, `complete`, `failed`) and `currentStage`
- **View in Gallery link**: After prompt submission, a "View in Gallery →" link appears replacing the image drop and example prompt sections (loading bars remain visible)
- **Resumable from gallery**: Clicking a gallery entry for an in-progress job loads it into the correct pipeline phase
- **Pipeline runs independently**: Client disconnect does NOT abort the pipeline. Gallery is the source of truth.
- **HTML interactions during loading**: File upload, example prompts hidden; textarea read-only during generation
- **Cancel button**: During prompt/generation, a cancel button appears that deletes the gallery entry and resets state
- **Delete from gallery**: Only in the modal (not on cards), with a confirm-then-delete pattern
- **Progress bar**: Stage-based progress derived from `pipelineStages` instead of inaccurate timed progress

## Bugs Found & Fixed

1. **`plan-ready` event after `plan-awaiting-approval`**: Stream endpoint sent both events, causing `planApprovalPending` to flip to `false`. Fixed by only sending the correct event for the current state.
2. **`resumeFromGallery` set `loading: "pipeline"` for `awaiting-approval`**: Caused wrong phase. Fixed: `loading: null` for `awaiting-approval`.
3. **SSE connected for `awaiting-approval` was harmful**: Connecting to stream sent duplicate `plan-ready` which un-set approval state. Fixed: don't connect SSE for `awaiting-approval`; connect after plan approval via `approvePlan` in ApprovalScreen.
4. **Fall-through switch case**: `plan-ready` and `plan-awaiting-approval` shared a switch block with `setPlanApprovalPending(event.type === "plan-awaiting-approval")`. `plan-ready` arriving second set `planApprovalPending = false`. Split into separate cases.
5. **Progress bar constantly resetting**: `useTimedProgress` reset on every re-render. Replaced with stage-based progress derived from `pipelineStages` using weighted percentages.
6. **Gallery API didn't include plan for enriched entries**: Early return shortcutted before the plan inclusion logic. Fixed by enriching status first, then checking for plan.
7. **Non-live `awaiting-approval` stream sent `pipeline-error`**: Fixed to send `plan-awaiting-approval` with plan data from `plan.json`.

## Completed

1. **Gallery entry type** — `status`, `currentStage`, `updatedAt` fields + `initGalleryEntry()`, `updateGalleryEntry()`, `deleteGalleryEntry()` functions
2. **Plan persistence** — `writePlan()`/`readPlan()`/`writeConceptText()`/`readConceptText()` in job-manager.ts
3. **Executor updated** — Gallery status saves at each stage transition, `broadcast()` pattern for subscriber events, `subscribers` array on PipelineController
4. **Pipeline decoupled from SSE** — Route runs pipeline in background, client disconnect doesn't abort
5. **SSE reconnection endpoint** — `GET /api/pipeline/[jobId]/stream` for resuming live pipelines
6. **Gallery API** — Enriched with manifest status + plan data for `awaiting-approval` entries; `DELETE` handler for removing jobs
7. **Gallery page** — Shows in-progress entries with animated status badges, auto-refreshes, resume buttons navigate to `/workshop?jobId=`
8. **WorkshopApp resume** — `?jobId=` URL param loads state from gallery+manifest, SSE reconnect for live jobs, SSE connect after plan approval
9. **Phase bug fixes** — All `planAwaitingPending` bugs fixed across stream endpoint, store, WorkshopApp, PromptComposer
10. **Stage-based progress bar** — Replaces timed progress, no resets, based on actual pipeline stage state
11. **UI during loading** — Textarea becomes read-only, file upload and examples hidden
12. **Cancel button** — Added to PromptComposer during generation, calls `DELETE /api/gallery`, resets state
13. **`deleteJobDir()`** — Added to job-manager for cleaning up job files; removes entire job directory on deletion
14. **Gallery modal delete button** — Two-step confirm-then-delete pattern in modal, `onDeleted` callback wired to `fetchGallery` in AnimationsPage
15. **Failed entries open in modal** — `handleSelect` routes complete + failed entries to modal (for deletion); in-progress entries go to workshop

## Relevant files / directories

### Backend
- `lib/gallery.ts` — GalleryEntry type, init/update/save/delete functions
- `lib/pipeline/job-manager.ts` — `createJobDir`, `writeManifest`, `writePlan`, `readPlan`, `deleteJobDir`, cleanup
- `lib/pipeline/executor.ts` — Pipeline execution with `broadcast()`, gallery updates at stage transitions, `removeController`, `subscribers` pattern
- `lib/store.ts` — Zustand store with `resumeFromGallery` action, `loading: null` fix for `awaiting-approval`
- `app/api/pipeline/route.ts` — POST handler, decoupled SSE from pipeline lifecycle
- `app/api/pipeline/[jobId]/control/route.ts` — Approve/abort/update/regenerate control
- `app/api/pipeline/[jobId]/stream/route.ts` — GET SSE reconnection endpoint, sends correct events for `awaiting-approval`
- `app/api/gallery/route.ts` — GET (enriched list/detail with plan data) + DELETE handler

### Frontend
- `components/WorkshopApp.tsx` — WorkshopApp with resume-from-gallery, ApprovalScreen with SSE connect after approval, PromptScreen with "View in Gallery" link, phase logic
- `components/PromptComposer.tsx` — Read-only textarea during loading, hidden upload/examples, cancel button, stage-based progress bar
- `app/(studio)/animations/page.tsx` — Gallery page with in-progress entries, status badges, auto-refresh, modal with delete button

### Config
- `lib/pipeline/types.ts` — PipelineEvent types
- `hooks/useTimedProgress.ts` — Still exists but no longer imported by PromptComposer