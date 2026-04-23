"use client";

import { useEffect, useState } from "react";

type ControllerInfo = {
  jobId: string;
  currentStage: string | null;
  status: string;
  autoContinue: boolean;
  subscriberCount: number;
  regenerateQueueLength: number;
  regenerateInFlight: string[];
  sceneStateCount: number;
  hasCurrentSceneAbort: boolean;
  hasPausePromise: boolean;
  hasApprovalPromise: boolean;
  lastApprovalHeartbeat: number;
};

type GalleryItem = {
  jobId: string;
  title: string;
  status: string;
  currentStage: string | null;
  mode: string;
  sceneCount: number;
  durationSeconds: number;
  createdAt: number;
  updatedAt: number;
};

type TokenAggregate = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUSD: number;
  sceneCount: number;
};

type JobDirInfo = {
  jobId: string;
  exists: boolean;
  manifestStatus: string | null;
  planTitle: string | null;
  sceneStateCount: number;
  clipsCount: number;
  diskUsage: string;
  tokens: TokenAggregate;
};

type TimingEntry = {
  provider: string;
  model: string;
  durationMs: number;
  promptTokens?: number;
  timestamp: string;
};

type StatusData = {
  timestamp: string;
  server: {
    uptime: number;
    memory: Record<string, number>;
    pid: number;
    nodeVersion: string;
    platform: string;
  };
  activeControllers: ControllerInfo[];
  gallery: GalleryItem[];
  jobDirectories: JobDirInfo[];
  tokens: {
    total: TokenAggregate;
    providerBreakdown: Record<string, TokenAggregate>;
  };
  disk: {
    mediaRoot: string;
    totalSize: string;
    totalFiles: number;
  };
  timingHistory: {
    entries: number;
    last10: TimingEntry[];
  };
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatUSD(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatDate(ts: number | string): string {
  const d = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 rounded-lg border border-slate-700 bg-slate-900">
      <div className="border-b border-slate-700 px-4 py-2">
        <h2 className="font-mono text-sm font-semibold text-slate-300">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  const c = color ?? "bg-slate-700 text-slate-300";
  return (
    <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${c}`}>
      {children}
    </span>
  );
}

export default function DevPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/admin/status");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as StatusData;
      setData(json);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
        <span className="font-mono text-sm">Loading dev dashboard...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">
        <div className="text-center">
          <p className="font-mono text-sm">Error: {error}</p>
          <button
            onClick={fetchData}
            className="mt-3 rounded bg-slate-800 px-3 py-1 font-mono text-xs text-slate-300 hover:bg-slate-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const activeCount = data.activeControllers.length;
  const galleryCount = data.gallery.length;
  const jobDirCount = data.jobDirectories.length;

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-300">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-mono text-lg font-bold text-slate-100">Dev Dashboard</h1>
            <p className="mt-0.5 font-mono text-xs text-slate-500">
              PID {data.server.pid} · {data.server.platform} · {data.server.nodeVersion}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="font-mono text-[10px] text-slate-600">
                Updated {lastRefresh.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              className="rounded bg-slate-800 px-3 py-1.5 font-mono text-xs text-slate-300 hover:bg-slate-700"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Uptime</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{formatUptime(data.server.uptime)}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Active Controllers</div>
            <div className={`mt-1 font-mono text-sm font-semibold ${activeCount > 0 ? "text-emerald-400" : "text-slate-200"}`}>
              {activeCount}
            </div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Gallery Entries</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{galleryCount}</div>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-900 p-3">
            <div className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Disk</div>
            <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{data.disk.totalSize}</div>
            <div className="font-mono text-[10px] text-slate-500">{data.disk.totalFiles} files</div>
          </div>
        </div>

        {/* Memory */}
        <Section title="Memory">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Object.entries(data.server.memory).map(([key, val]) => (
              <div key={key} className="rounded bg-slate-800/50 px-3 py-2">
                <div className="font-mono text-[10px] uppercase text-slate-500">{key}</div>
                <div className="font-mono text-xs text-slate-300">{(val / 1024 / 1024).toFixed(1)} MB</div>
              </div>
            ))}
          </div>
        </Section>

        {/* Active Controllers */}
        <Section title={`Active Controllers (${activeCount})`}>
          {activeCount === 0 ? (
            <p className="font-mono text-xs text-slate-500">No active pipeline controllers in memory.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {data.activeControllers.map((c) => (
                <div key={c.jobId} className="rounded border border-slate-700 bg-slate-800/40 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-200">{c.jobId.slice(0, 8)}...</span>
                    <Badge color="bg-amber-900/40 text-amber-300">{c.status}</Badge>
                    {c.currentStage && <Badge color="bg-blue-900/40 text-blue-300">{c.currentStage}</Badge>}
                    {c.autoContinue && <Badge color="bg-emerald-900/40 text-emerald-300">auto-continue</Badge>}
                    {c.hasCurrentSceneAbort && <Badge color="bg-red-900/40 text-red-300">scene-abort</Badge>}
                    {c.hasPausePromise && <Badge color="bg-purple-900/40 text-purple-300">paused</Badge>}
                    {c.hasApprovalPromise && <Badge color="bg-orange-900/40 text-orange-300">awaiting-approval</Badge>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-slate-400">
                    <span>subscribers: {c.subscriberCount}</span>
                    <span>regenerateQueue: {c.regenerateQueueLength}</span>
                    <span>sceneStates: {c.sceneStateCount}</span>
                    {c.regenerateInFlight.length > 0 && (
                      <span>inFlight: {c.regenerateInFlight.join(", ")}</span>
                    )}
                    {c.lastApprovalHeartbeat > 0 && (
                      <span>heartbeat: {formatDate(c.lastApprovalHeartbeat)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Gallery */}
        <Section title={`Gallery (${galleryCount})`}>
          {galleryCount === 0 ? (
            <p className="font-mono text-xs text-slate-500">No gallery entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="pb-2 pr-4">Job ID</th>
                    <th className="pb-2 pr-4">Title</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Stage</th>
                    <th className="pb-2 pr-4">Mode</th>
                    <th className="pb-2 pr-4">Scenes</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gallery.map((g) => (
                    <tr key={g.jobId} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-4 text-slate-400">{g.jobId.slice(0, 8)}...</td>
                      <td className="py-1.5 pr-4 text-slate-300">{g.title}</td>
                      <td className="py-1.5 pr-4">
                        <Badge
                          color={
                            g.status === "complete"
                              ? "bg-emerald-900/30 text-emerald-400"
                              : g.status === "failed"
                                ? "bg-red-900/30 text-red-400"
                                : g.status === "generating"
                                  ? "bg-amber-900/30 text-amber-400"
                                  : "bg-slate-700 text-slate-300"
                          }
                        >
                          {g.status}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-slate-400">{g.currentStage ?? "-"}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{g.mode}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{g.sceneCount}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{g.durationSeconds}s</td>
                      <td className="py-1.5 pr-4 text-slate-500">{formatDate(g.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Token Usage */}
        <Section title="Token Usage">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded bg-slate-800/50 px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-slate-500">Input Tokens</div>
              <div className="font-mono text-sm font-semibold text-slate-200">{formatNumber(data.tokens.total.inputTokens)}</div>
            </div>
            <div className="rounded bg-slate-800/50 px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-slate-500">Output Tokens</div>
              <div className="font-mono text-sm font-semibold text-slate-200">{formatNumber(data.tokens.total.outputTokens)}</div>
            </div>
            <div className="rounded bg-slate-800/50 px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-slate-500">Cached Tokens</div>
              <div className="font-mono text-sm font-semibold text-slate-200">{formatNumber(data.tokens.total.cachedTokens)}</div>
            </div>
            <div className="rounded bg-slate-800/50 px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-slate-500">Scenes</div>
              <div className="font-mono text-sm font-semibold text-slate-200">{data.tokens.total.sceneCount}</div>
            </div>
            <div className="rounded bg-emerald-900/20 px-3 py-2">
              <div className="font-mono text-[10px] uppercase text-emerald-500">Est. Cost</div>
              <div className="font-mono text-sm font-semibold text-emerald-400">{formatUSD(data.tokens.total.estimatedCostUSD)}</div>
            </div>
          </div>

          {Object.keys(data.tokens.providerBreakdown).length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="pb-2 pr-4">Provider/Model</th>
                    <th className="pb-2 pr-4">Input</th>
                    <th className="pb-2 pr-4">Output</th>
                    <th className="pb-2 pr-4">Cached</th>
                    <th className="pb-2 pr-4">Scenes</th>
                    <th className="pb-2 pr-4">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.tokens.providerBreakdown).map(([key, t]) => (
                    <tr key={key} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-4 text-slate-300">{key}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{formatNumber(t.inputTokens)}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{formatNumber(t.outputTokens)}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{formatNumber(t.cachedTokens)}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{t.sceneCount}</td>
                      <td className="py-1.5 pr-4 text-emerald-400">{formatUSD(t.estimatedCostUSD)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Job Directories */}
        <Section title={`Job Directories (${jobDirCount})`}>
          {jobDirCount === 0 ? (
            <p className="font-mono text-xs text-slate-500">No job directories on disk.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="pb-2 pr-4">Job ID</th>
                    <th className="pb-2 pr-4">Manifest</th>
                    <th className="pb-2 pr-4">Plan Title</th>
                    <th className="pb-2 pr-4">Scene States</th>
                    <th className="pb-2 pr-4">Clips</th>
                    <th className="pb-2 pr-4">Disk</th>
                    <th className="pb-2 pr-4">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobDirectories.map((d) => (
                    <tr key={d.jobId} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-4 text-slate-400">{d.jobId.slice(0, 8)}...</td>
                      <td className="py-1.5 pr-4">
                        <Badge
                          color={
                            d.manifestStatus === "complete"
                              ? "bg-emerald-900/30 text-emerald-400"
                              : d.manifestStatus === "failed"
                                ? "bg-red-900/30 text-red-400"
                                : d.manifestStatus === "running"
                                  ? "bg-amber-900/30 text-amber-400"
                                  : "bg-slate-700 text-slate-400"
                          }
                        >
                          {d.manifestStatus ?? "none"}
                        </Badge>
                      </td>
                      <td className="py-1.5 pr-4 text-slate-300">{d.planTitle ?? "-"}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{d.sceneStateCount}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{d.clipsCount}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{d.diskUsage}</td>
                      <td className="py-1.5 pr-4 text-emerald-400">{formatUSD(d.tokens.estimatedCostUSD)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Timing History */}
        <Section title={`Plan Timing History (${data.timingHistory.entries} entries)`}>
          {data.timingHistory.last10.length === 0 ? (
            <p className="font-mono text-xs text-slate-500">No timing history yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-500">
                    <th className="pb-2 pr-4">Provider</th>
                    <th className="pb-2 pr-4">Model</th>
                    <th className="pb-2 pr-4">Duration</th>
                    <th className="pb-2 pr-4">Tokens</th>
                    <th className="pb-2 pr-4">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data.timingHistory.last10.map((t, i) => (
                    <tr key={i} className="border-b border-slate-800/50">
                      <td className="py-1.5 pr-4 text-slate-400">{t.provider}</td>
                      <td className="py-1.5 pr-4 text-slate-400">{t.model}</td>
                      <td className="py-1.5 pr-4 text-slate-300">{(t.durationMs / 1000).toFixed(1)}s</td>
                      <td className="py-1.5 pr-4 text-slate-400">{t.promptTokens ?? "-"}</td>
                      <td className="py-1.5 pr-4 text-slate-500">{formatDate(t.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
