import type { PipelineEvent } from "./types";

export function getStageCompleteStatus(event: PipelineEvent): "success" | "skipped" {
  if (event.type !== "stage-complete") return "success";
  return (event.result as { status?: string } | undefined)?.status === "skipped" ? "skipped" : "success";
}

