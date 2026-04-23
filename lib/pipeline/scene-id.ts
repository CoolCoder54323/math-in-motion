const SCENE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function parseSceneId(sceneId: string): string {
  const normalized = sceneId.trim();
  if (!SCENE_ID_PATTERN.test(normalized)) {
    throw new Error(`Invalid sceneId "${sceneId}".`);
  }
  return normalized;
}

