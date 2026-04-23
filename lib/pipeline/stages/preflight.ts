import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractThumbnail } from "../ffmpeg-runner";
import { getManimKitPython } from "../manim-kit";
import type {
  GeneratedScene,
  PreflightBeatSnapshot,
  PreflightIssue,
  PreflightMetrics,
  PreflightObjectSnapshot,
  PreflightReport,
} from "../types";

const PREFLIGHT_TIMEOUT_MS = 60_000;
const PREFLIGHT_QUALITY = "l" as const;

type RawPreflightFile = {
  snapshots?: PreflightBeatSnapshot[];
  safeArea?: { xMin: number; xMax: number; yMin: number; yMax: number };
};

function qualityDir(quality: "l" | "m" | "h"): string {
  return quality === "l" ? "480p15" : quality === "m" ? "720p30" : "1080p60";
}

function findVideoPath(mediaDir: string, quality: "l" | "m" | "h"): string | null {
  const videosDir = join(mediaDir, "videos");
  if (!existsSync(videosDir)) return null;
  for (const subdir of readdirSync(videosDir, { withFileTypes: true })) {
    if (!subdir.isDirectory()) continue;
    const qDir = join(videosDir, subdir.name, qualityDir(quality));
    if (!existsSync(qDir)) continue;
    const mp4Files = readdirSync(qDir).filter((file) => file.endsWith(".mp4"));
    if (mp4Files.length > 0) {
      return join(qDir, mp4Files[0]);
    }
  }
  return null;
}

function overlapArea(a: PreflightObjectSnapshot, b: PreflightObjectSnapshot): number {
  const width = Math.max(0, Math.min(a.xMax, b.xMax) - Math.max(a.xMin, b.xMin));
  const height = Math.max(0, Math.min(a.yMax, b.yMax) - Math.max(a.yMin, b.yMin));
  return width * height;
}

function objectArea(objectSpec: PreflightObjectSnapshot): number {
  return Math.max(0, objectSpec.width) * Math.max(0, objectSpec.height);
}

function occupancy(objects: PreflightObjectSnapshot[], safeArea: { xMin: number; xMax: number; yMin: number; yMax: number }): number {
  const safeAreaArea = Math.max(0.0001, (safeArea.xMax - safeArea.xMin) * (safeArea.yMax - safeArea.yMin));
  const area = objects
    .filter((item) => item.visible)
    .reduce((sum, item) => sum + objectArea(item), 0);
  return area / safeAreaArea;
}

function hasParentChildRelation(
  a: PreflightObjectSnapshot,
  b: PreflightObjectSnapshot,
  sceneObjects: { id: string; relatedTo?: string[] }[] = [],
): boolean {
  const aObj = sceneObjects.find((o) => o.id === a.id);
  const bObj = sceneObjects.find((o) => o.id === b.id);
  if (aObj?.relatedTo?.includes(b.id) || bObj?.relatedTo?.includes(a.id)) return true;
  // Also treat border/line + fill pairs as parent-child if names suggest it
  const pair = [a.id.toLowerCase(), b.id.toLowerCase()].sort();
  if (
    pair[0].includes("fence") && pair[1].includes("soil") ||
    pair[0].includes("border") && pair[1].includes("fill") ||
    pair[0].includes("outline") && pair[1].includes("interior") ||
    pair[0].includes("dashed") && pair[1].includes("solid")
  ) return true;
  return false;
}

function computeBalance(objects: PreflightObjectSnapshot[]): number {
  const visible = objects.filter((item) => item.visible);
  if (visible.length === 0) return 1;
  const totalArea = visible.reduce((sum, item) => sum + objectArea(item), 0) || 1;
  const weightedX = visible.reduce((sum, item) => sum + item.centerX * objectArea(item), 0) / totalArea;
  const weightedY = visible.reduce((sum, item) => sum + item.centerY * objectArea(item), 0) / totalArea;
  const normalized = Math.min(1, Math.sqrt(weightedX * weightedX + weightedY * weightedY) / 5);
  return 1 - normalized;
}

function computeMetrics(
  snapshots: PreflightBeatSnapshot[],
  safeArea: { xMin: number; xMax: number; yMin: number; yMax: number },
  sceneObjects: { id: string; relatedTo?: string[] }[] = [],
): { metrics: PreflightMetrics; issues: PreflightIssue[] } {
  const issues: PreflightIssue[] = [];
  let worstOverlap = 0;
  let worstOverflow = 0;
  let occupancyScore = 1;
  let legibilityScore = 1;
  let balanceScore = 1;

  for (const snapshot of snapshots) {
    const visible = snapshot.objects.filter((objectSpec) => objectSpec.visible);
    const beatOccupancy = occupancy(snapshot.objects, safeArea);
    if (beatOccupancy < 0.05 || beatOccupancy > 1.5) {
      issues.push({
        sceneId: "",
        severity: "error",
        category: "occupancy",
        beatId: snapshot.beatId,
        message: `Scene occupancy ${beatOccupancy.toFixed(2)} is outside the acceptable range.`,
        suggestedFix: "Redistribute objects across zones or reduce visual clutter.",
      });
    } else if (beatOccupancy < 0.10 || beatOccupancy > 1.2) {
      issues.push({
        sceneId: "",
        severity: "warning",
        category: "occupancy",
        beatId: snapshot.beatId,
        message: `Scene occupancy ${beatOccupancy.toFixed(2)} is high — consider simplifying.`,
      });
    }
    occupancyScore = Math.min(occupancyScore, 1 - Math.min(1, Math.abs(beatOccupancy - 0.42) / 0.42));

    for (const objectSpec of visible) {
      const overflow = Math.max(
        0,
        safeArea.xMin - objectSpec.xMin,
        objectSpec.xMax - safeArea.xMax,
        safeArea.yMin - objectSpec.yMin,
        objectSpec.yMax - safeArea.yMax,
      );
      worstOverflow = Math.max(worstOverflow, overflow);
      if (overflow > 1.0) {
        issues.push({
          sceneId: "",
          severity: "error",
          category: "overflow",
          beatId: snapshot.beatId,
          objectIds: [objectSpec.id],
          message: `Object "${objectSpec.id}" leaves the safe area by ${overflow.toFixed(2)} units.`,
          suggestedFix: "Shrink the object, move it inward, or give it a wider zone.",
        });
      } else if (overflow > 0.60) {
        issues.push({
          sceneId: "",
          severity: "warning",
          category: "overflow",
          beatId: snapshot.beatId,
          objectIds: [objectSpec.id],
          message: `Object "${objectSpec.id}" is near the safe area edge (${overflow.toFixed(2)} units).`,
        });
      }
      const fontSize = objectSpec.fontSize ?? 0;
      if (fontSize > 0) {
        if (fontSize < 18) {
          issues.push({
            sceneId: "",
            severity: "error",
            category: "legibility",
            beatId: snapshot.beatId,
            objectIds: [objectSpec.id],
            message: `Text object "${objectSpec.id}" is too small at ${fontSize.toFixed(1)}.`,
            suggestedFix: "Increase font size or simplify the amount of text on screen.",
          });
        } else if (fontSize < 22) {
          issues.push({
            sceneId: "",
            severity: "warning",
            category: "legibility",
            beatId: snapshot.beatId,
            objectIds: [objectSpec.id],
            message: `Text object "${objectSpec.id}" is on the small side at ${fontSize.toFixed(1)}.`,
          });
        }
        legibilityScore = Math.min(legibilityScore, Math.min(1, fontSize / 28));
      }
    }

    for (let index = 0; index < visible.length; index++) {
      for (let inner = index + 1; inner < visible.length; inner++) {
        const left = visible[index];
        const right = visible[inner];
        if (left.relatedTo?.includes(right.id) || right.relatedTo?.includes(left.id)) continue;
        if (hasParentChildRelation(left, right, sceneObjects)) continue;
        const overlap = overlapArea(left, right);
        const smallerArea = Math.max(0.0001, Math.min(objectArea(left), objectArea(right)));
        const overlapRatio = overlap / smallerArea;
        worstOverlap = Math.max(worstOverlap, overlapRatio);
        if (overlapRatio > 0.35) {
          issues.push({
            sceneId: "",
            severity: "error",
            category: "overlap",
            beatId: snapshot.beatId,
            objectIds: [left.id, right.id],
            message: `Objects "${left.id}" and "${right.id}" overlap too much (${(overlapRatio * 100).toFixed(1)}%).`,
            suggestedFix: "Separate the objects into different lanes or reduce their scale.",
          });
        } else if (overlapRatio > 0.15) {
          issues.push({
            sceneId: "",
            severity: "warning",
            category: "overlap",
            beatId: snapshot.beatId,
            objectIds: [left.id, right.id],
            message: `Objects "${left.id}" and "${right.id}" are beginning to overlap (${(overlapRatio * 100).toFixed(1)}%).`,
          });
        }
      }
    }

    const beatBalance = computeBalance(snapshot.objects);
    balanceScore = Math.min(balanceScore, beatBalance);
    if (beatBalance < 0.35) {
      issues.push({
        sceneId: "",
        severity: "warning",
        category: "balance",
        beatId: snapshot.beatId,
        message: "The composition is heavily weighted away from the center.",
      });
    }
  }

  return {
    metrics: {
      overlapScore: 1 - Math.min(1, worstOverlap),
      overflowScore: 1 - Math.min(1, worstOverflow / 0.3),
      occupancyScore,
      textLegibilityScore: legibilityScore,
      balanceScore,
    },
    issues,
  };
}

function runManimPreflight(scene: GeneratedScene, jobDir: string, assets?: string[]) {
  const sceneDir = join(jobDir, "preflight", scene.sceneId);
  const mediaDir = join(sceneDir, "media");
  mkdirSync(sceneDir, { recursive: true });
  writeFileSync(join(sceneDir, "scene.py"), scene.pythonCode, "utf-8");
  writeFileSync(join(sceneDir, "manim_kit.py"), getManimKitPython(), "utf-8");

  if (assets && assets.length > 0) {
    const assetsDir = join(jobDir, "assets");
    for (const assetName of assets) {
      const src = join(assetsDir, assetName);
      if (existsSync(src)) {
        copyFileSync(src, join(sceneDir, assetName));
      }
    }
  }

  const reportPath = join(sceneDir, "preflight-raw.json");

  const args = [
    "render",
    join(sceneDir, "scene.py"),
    scene.className,
    `-q${PREFLIGHT_QUALITY}`,
    "--media_dir",
    mediaDir,
    "--format",
    "mp4",
    "--disable_caching",
  ];

  return new Promise<{ reportPath: string; videoPath: string; sceneDir: string }>((resolve, reject) => {
    execFile(
      "manim",
      args,
      {
        timeout: PREFLIGHT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PYTHONUNBUFFERED: "1",
          MIM_PREFLIGHT_REPORT: reportPath,
        },
      },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Preflight render failed for "${scene.sceneId}": ${error.message}\n${stderr}`));
          return;
        }
        const videoPath = findVideoPath(mediaDir, PREFLIGHT_QUALITY);
        if (!videoPath) {
          reject(new Error(`Preflight did not produce a video for "${scene.sceneId}".`));
          return;
        }
        resolve({ reportPath, videoPath, sceneDir });
      },
    );
  });
}

export async function preflightScene(
  scene: GeneratedScene,
  jobDir: string,
  assets?: string[],
): Promise<PreflightReport> {
  const { reportPath, videoPath, sceneDir } = await runManimPreflight(scene, jobDir, assets);
  const raw = JSON.parse(readFileSync(reportPath, "utf-8")) as RawPreflightFile;
  const snapshots = raw.snapshots ?? [];
  const safeArea = raw.safeArea ?? scene.sceneIR.layout.safeArea ?? {
    xMin: -6.5,
    xMax: 6.5,
    yMin: -3.5,
    yMax: 3.5,
  };

  // Pass scene objects so parent-child overlap can be detected
  const sceneObjects = scene.sceneIR.objects ?? [];
  const analyzed = computeMetrics(snapshots, safeArea, sceneObjects);
  const keyframesDir = join(jobDir, "preflight", "keyframes");
  mkdirSync(keyframesDir, { recursive: true });

  const limitedSnapshots = snapshots.slice(0, 5);
  const keyframes: string[] = [];
  for (const snapshot of limitedSnapshots) {
    const outputPath = join(keyframesDir, `${scene.sceneId}-${snapshot.beatId}.jpg`);
    await extractThumbnail(videoPath, outputPath, Math.max(0.05, snapshot.timestampSeconds));
    keyframes.push(outputPath);
  }

  const issues = analyzed.issues.map((issue) => ({
    ...issue,
    sceneId: scene.sceneId,
  }));
  const report: PreflightReport = {
    passed: !issues.some((issue) => issue.severity === "error"),
    issues,
    metrics: analyzed.metrics,
    keyframes,
    snapshots,
  };

  writeFileSync(
    join(jobDir, "preflight", `${scene.sceneId}.json`),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  try {
    rmSync(sceneDir, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }

  return report;
}
