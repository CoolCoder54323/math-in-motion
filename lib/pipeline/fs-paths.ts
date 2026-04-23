import { join, normalize } from "node:path";
import { parseSceneId } from "./contracts";

export type JobPathKind = "clips" | "scenes" | "scene-ir" | "preflight";

export function safeJobPath(jobDir: string, kind: JobPathKind, sceneId: string, ext = "mp4"): string {
  const parsed = parseSceneId(sceneId);
  if (!parsed) {
    throw new Error("Invalid sceneId for filesystem path.");
  }

  const fileName = `${parsed}.${ext}`;
  const path = normalize(join(jobDir, kind, fileName));
  const root = normalize(join(jobDir, kind));

  if (!path.startsWith(root)) {
    throw new Error("Unsafe scene path.");
  }

  return path;
}
