export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Use dynamic import so Edge runtime doesn't parse Node-only modules
    import("./lib/pipeline/job-manager").then(({ recoverOrphanedJobs, killOrphanedPids }) => {
      const pidStats = killOrphanedPids();
      if (pidStats.killed > 0) {
        console.log(`[startup] Killed ${pidStats.killed} orphaned Manim processes`);
      }

      const recovered = recoverOrphanedJobs();
      if (recovered.length > 0) {
        console.log(`[startup] Recovered ${recovered.length} orphaned jobs:`);
        for (const r of recovered) {
          console.log(`  ${r.jobId}: ${r.previousStatus} → ${r.newStatus} (${r.reason})`);
        }
      }
    });

    import("./lib/gallery").then(({ syncGalleryFromManifests }) => {
      const synced = syncGalleryFromManifests();
      if (synced > 0) {
        console.log(`[startup] Synced ${synced} gallery entries from manifests`);
      }
    });
  }
}
