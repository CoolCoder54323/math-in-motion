export type PipelineStatus =
  | "created"
  | "planning"
  | "awaiting-approval"
  | "building"
  | "awaiting-confirmation"
  | "composing"
  | "complete"
  | "failed"
  | "interrupted"
  | "aborted"
  | "paused";

export type PipelineAction =
  | "start-planning"
  | "plan-ready"
  | "approve"
  | "render-failures-found"
  | "continue"
  | "start-compose"
  | "complete"
  | "fail"
  | "interrupt"
  | "abort"
  | "pause";

const TRANSITIONS: Record<PipelineStatus, Partial<Record<PipelineAction, PipelineStatus>>> = {
  created: { "start-planning": "planning", abort: "aborted" },
  planning: { "plan-ready": "awaiting-approval", fail: "failed", interrupt: "interrupted", abort: "aborted" },
  "awaiting-approval": { approve: "building", abort: "aborted", pause: "paused" },
  building: { "render-failures-found": "awaiting-confirmation", "start-compose": "composing", fail: "failed", abort: "aborted", pause: "paused" },
  "awaiting-confirmation": { continue: "composing", abort: "aborted", pause: "paused" },
  composing: { complete: "complete", fail: "failed", abort: "aborted", pause: "paused" },
  complete: {},
  failed: {},
  interrupted: {},
  aborted: {},
  paused: {},
};

export function assertTransition(from: PipelineStatus, action: PipelineAction): void {
  if (!TRANSITIONS[from][action]) {
    throw new Error(`Illegal pipeline transition: ${from} --${action}--> ?`);
  }
}

export function transition(from: PipelineStatus, action: PipelineAction): PipelineStatus {
  assertTransition(from, action);
  return TRANSITIONS[from][action] as PipelineStatus;
}

