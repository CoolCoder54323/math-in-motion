import { NextResponse } from "next/server";
import { getController } from "@/lib/pipeline/executor";
import type { PlanOutput, SceneEntry } from "@/lib/pipeline/types";

/**
 * POST /api/pipeline/[jobId]/control
 *
 * Controls a running pipeline:
 *   - "pause" / "resume" / "abort"   — mid-flight pause gate
 *   - "approve-plan"                 — unblock the plan-approval gate
 *   - "update-plan"                  — replace the in-flight plan (affects
 *                                       scenes not yet processed)
 *   - "regenerate-scene"             — queue a scene for re-generation
 */

type ApprovePlanBody = { action: "approve-plan"; plan: PlanOutput };
type UpdatePlanBody = { action: "update-plan"; plan: PlanOutput };
type RegenerateBody = {
  action: "regenerate-scene";
  sceneId: string;
  sceneUpdate?: Partial<SceneEntry>;
};
type HeartbeatBody = { action: "heartbeat" };
type ContinueBody = { action: "continue" };
type SetAutoContinueBody = { action: "set-auto-continue"; value: boolean };
type LegacyBody = { action: "pause" | "resume" | "abort" };

type ControlBody = LegacyBody | ApprovePlanBody | UpdatePlanBody | RegenerateBody | HeartbeatBody | ContinueBody | SetAutoContinueBody;

/* Structural validation — defensively walk the plan shape before accepting it. */
function isValidPlan(p: unknown): p is PlanOutput {
  if (!p || typeof p !== "object") return false;
  const plan = p as Record<string, unknown>;
  if (typeof plan.title !== "string") return false;
  if (typeof plan.estimatedDuration !== "number") return false;
  if (!Array.isArray(plan.steps)) return false;
  if (!Array.isArray(plan.sceneBreakdown)) return false;
  if (plan.sceneBreakdown.length === 0) return false;
  for (const s of plan.sceneBreakdown as Record<string, unknown>[]) {
    if (typeof s.sceneId !== "string" || !s.sceneId) return false;
    if (typeof s.description !== "string") return false;
    if (typeof s.mathContent !== "string") return false;
    if (typeof s.estimatedSeconds !== "number") return false;
  }
  return true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  if (!/^[a-f0-9-]{36}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid job ID." }, { status: 400 });
  }

  let body: ControlBody;
  try {
    body = (await request.json()) as ControlBody;
  } catch {
    return NextResponse.json(
      { error: "Expected JSON body with 'action'." },
      { status: 400 },
    );
  }

  const controller = getController(jobId);
  if (!controller) {
    return NextResponse.json(
      { error: "No active pipeline found for this job." },
      { status: 404 },
    );
  }

  switch (body.action) {
    case "pause": {
      controller.ctx.pauseRequested = true;
      return NextResponse.json({ ok: true, status: "pause-requested" });
    }

    case "resume": {
      if (controller.pausePromise) {
        controller.resume();
        return NextResponse.json({ ok: true, status: "resumed" });
      }
      return NextResponse.json(
        { ok: false, error: "Pipeline is not currently paused." },
        { status: 409 },
      );
    }

    case "abort": {
      controller.abort.abort();
      // Unblock any waiting gates so cleanup can run.
      if (controller.pausePromise) controller.resume();
      if (controller.approvePlan) {
        // Approve with whatever we have so the gate resolves; the abort
        // check downstream will short-circuit before work continues.
        controller.approvePlan(controller.currentPlan!);
      }
      if (controller.confirmPipeline) controller.confirmPipeline();
      if (controller.currentSceneAbort) controller.currentSceneAbort.abort();
      return NextResponse.json({ ok: true, status: "aborted" });
    }

    case "approve-plan": {
      if (!isValidPlan(body.plan)) {
        return NextResponse.json(
          { error: "Invalid plan shape." },
          { status: 400 },
        );
      }
      if (!controller.approvePlan) {
        return NextResponse.json(
          { ok: false, error: "Pipeline is not awaiting plan approval." },
          { status: 409 },
        );
      }
      controller.currentPlan = body.plan;
      controller.approvePlan(body.plan);
      return NextResponse.json({ ok: true, status: "plan-approved" });
    }

    case "update-plan": {
      if (!isValidPlan(body.plan)) {
        return NextResponse.json(
          { error: "Invalid plan shape." },
          { status: 400 },
        );
      }
      controller.currentPlan = body.plan;
      return NextResponse.json({ ok: true, status: "plan-updated" });
    }

    case "regenerate-scene": {
      if (!body.sceneId || typeof body.sceneId !== "string") {
        return NextResponse.json(
          { error: "Expected 'sceneId' string." },
          { status: 400 },
        );
      }
      if (!controller.currentPlan) {
        return NextResponse.json(
          { ok: false, error: "Pipeline has not reached a plan yet." },
          { status: 409 },
        );
      }
      const exists = controller.currentPlan.sceneBreakdown.some(
        (s) => s.sceneId === body.sceneId,
      );
      if (!exists) {
        return NextResponse.json(
          { error: `Unknown sceneId "${body.sceneId}".` },
          { status: 400 },
        );
      }

      // Dedup: if already queued, just merge any sceneUpdate into the
      // existing request.
      if (controller.regenerateInFlight.has(body.sceneId)) {
        const existing = controller.regenerateQueue.find(
          (r) => r.sceneId === body.sceneId,
        );
        if (existing && body.sceneUpdate) {
          existing.sceneUpdate = { ...existing.sceneUpdate, ...body.sceneUpdate };
        }
        return NextResponse.json({ ok: true, status: "regenerate-queued-dedup" });
      }

      controller.regenerateInFlight.add(body.sceneId);
      controller.regenerateQueue.push({
        sceneId: body.sceneId,
        sceneUpdate: body.sceneUpdate,
      });

      // If a scene is currently rendering and it's the one the user wants
      // to regenerate, abort that in-flight manim so the queue can pick up
      // the new version immediately.
      if (controller.currentSceneAbort) {
        // Only abort if the currently-rendering scene is the target.
        // We don't track that explicitly; the queue will re-process after
        // the current scene completes either way.
      }

      return NextResponse.json({ ok: true, status: "regenerate-queued" });
    }

    case "heartbeat": {
      controller.lastApprovalHeartbeat = Date.now();
      return NextResponse.json({ ok: true });
    }

    case "continue": {
      if (!controller.confirmPipeline) {
        return NextResponse.json({ ok: false, error: "Pipeline is not awaiting confirmation." }, { status: 409 });
      }
      // Safety check: reject if >20% scenes failed
      const total = controller.currentPlan?.sceneBreakdown.length ?? 1;
      const failed = controller.currentPlan?.sceneBreakdown.filter((s) =>
        controller.sceneStates[s.sceneId]?.status === "failed",
      ).length ?? 0;
      if (failed / total > 0.20) {
        return NextResponse.json({ ok: false, error: "Too many scenes failed to continue." }, { status: 409 });
      }
      controller.confirmPipeline();
      return NextResponse.json({ ok: true, status: "continued" });
    }

    case "set-auto-continue": {
      if (typeof body.value !== "boolean") {
        return NextResponse.json({ error: "Expected 'value' boolean." }, { status: 400 });
      }
      controller.autoContinue = body.value;
      return NextResponse.json({ ok: true, autoContinue: body.value });
    }

    default: {
      return NextResponse.json(
        {
          error:
            "Invalid action. Use pause, resume, abort, approve-plan, update-plan, regenerate-scene, heartbeat, continue, or set-auto-continue.",
        },
        { status: 400 },
      );
    }
  }
}
