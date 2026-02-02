"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

interface SourceRow {
  id: string;
  name: string;
  url: string;
  feed_url: string;
  source_type: string;
  active: boolean;
  last_fetched_at: string | null;
  last_error: string | null;
  consecutive_errors: number;
  last_success_at: string | null;
  created_at: string;
  article_count: number;
  latest_article_at: string | null;
}

interface IngestionLogRow {
  id: string;
  source_id: string | null;
  started_at: string;
  fetched: number;
  inserted: number;
  errors: string[];
  success: boolean;
  duration_ms: number;
}

type Tab = "sources" | "health";
type SortField = "name" | "type" | "articles" | "last_fetch" | "latest_article" | "status" | "errors";
type SortDir = "asc" | "desc";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

// Health thresholds — tuned for daily ingestion (cron runs once/day at 8am UTC)
const HEALTHY_HOURS = 26; // fetched within ~1 day + buffer
const STALE_HOURS = 50;   // missed one run (~2 days)
// Beyond STALE_HOURS = dead (missed 2+ runs)

function healthColor(lastFetched: string | null): string {
  if (!lastFetched) return "text-ast-pink";
  const hours = (Date.now() - new Date(lastFetched).getTime()) / 3600000;
  if (hours < HEALTHY_HOURS) return "text-ast-mint";
  if (hours < STALE_HOURS) return "text-ast-gold";
  return "text-ast-pink";
}

function healthDot(lastFetched: string | null): string {
  if (!lastFetched) return "bg-ast-pink";
  const hours = (Date.now() - new Date(lastFetched).getTime()) / 3600000;
  if (hours < HEALTHY_HOURS) return "bg-ast-mint";
  if (hours < STALE_HOURS) return "bg-ast-gold";
  return "bg-ast-pink";
}

function healthTooltip(lastFetched: string | null): string {
  if (!lastFetched) return "Never fetched";
  const hours = (Date.now() - new Date(lastFetched).getTime()) / 3600000;
  if (hours < HEALTHY_HOURS) return `Healthy — fetched ${Math.round(hours)}h ago`;
  if (hours < STALE_HOURS) return `Stale — last fetch was ${Math.round(hours)}h ago`;
  return `Dead — no fetch in ${Math.round(hours)}h`;
}

// ── Add Source Form ────────────────────────────────────────────────

function AddSourceForm({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [url, setUrl] = useState("");
  const [sourceType, setSourceType] = useState("news");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, feed_url: feedUrl, url: url || feedUrl, source_type: sourceType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setName("");
      setFeedUrl("");
      setUrl("");
      setSourceType("news");
      setOpen(false);
      onAdded();
    } catch (err: any) {
      setError(err.message || "Failed to add source");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 text-xs bg-ast-accent/10 border border-ast-accent/30 text-ast-accent rounded hover:bg-ast-accent/20 transition-colors"
      >
        + Add Source
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ast-border rounded-lg p-4 bg-ast-surface space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ast-accent">Add New Source</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-ast-muted hover:text-ast-text text-xs">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] text-ast-muted mb-1 uppercase tracking-wider">Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Kotaku"
            className="w-full bg-ast-bg border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text placeholder:text-ast-muted focus:border-ast-accent focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-[10px] text-ast-muted mb-1 uppercase tracking-wider">Type *</label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full bg-ast-bg border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text focus:border-ast-accent focus:outline-none"
          >
            <option value="news">News</option>
            <option value="newsletter">Newsletter</option>
            <option value="analysis">Analysis</option>
            <option value="podcast">Podcast</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-ast-muted mb-1 uppercase tracking-wider">RSS Feed URL *</label>
        <input
          value={feedUrl}
          onChange={(e) => setFeedUrl(e.target.value)}
          required
          type="url"
          placeholder="https://example.com/rss.xml"
          className="w-full bg-ast-bg border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text placeholder:text-ast-muted focus:border-ast-accent focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[10px] text-ast-muted mb-1 uppercase tracking-wider">Website URL (optional)</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          type="url"
          placeholder="https://example.com"
          className="w-full bg-ast-bg border border-ast-border rounded px-3 py-1.5 text-xs text-ast-text placeholder:text-ast-muted focus:border-ast-accent focus:outline-none"
        />
      </div>

      {error && <p className="text-ast-pink text-xs">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs border border-ast-border text-ast-muted rounded hover:text-ast-text transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-1.5 text-xs bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/80 disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding..." : "Add Source"}
        </button>
      </div>
    </form>
  );
}

// ── Health Dashboard ───────────────────────────────────────────────

function HealthDashboard({ sources, logs }: { sources: SourceRow[]; logs: IngestionLogRow[] }) {
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [hSortField, setHSortField] = useState<SortField>("last_fetch");
  const [hSortDir, setHSortDir] = useState<SortDir>("asc");
  const activeSources = sources.filter((s) => s.active);
  const totalArticles = sources.reduce((sum, s) => sum + s.article_count, 0);

  const healthy = activeSources.filter((s) => {
    if (!s.last_fetched_at) return false;
    return (Date.now() - new Date(s.last_fetched_at).getTime()) < HEALTHY_HOURS * 3600000;
  });
  const stale = activeSources.filter((s) => {
    if (!s.last_fetched_at) return false;
    const hours = (Date.now() - new Date(s.last_fetched_at).getTime()) / 3600000;
    return hours >= HEALTHY_HOURS && hours < STALE_HOURS;
  });
  const dead = activeSources.filter((s) => {
    if (!s.last_fetched_at) return true;
    return (Date.now() - new Date(s.last_fetched_at).getTime()) >= STALE_HOURS * 3600000;
  });
  const erroring = activeSources.filter((s) => s.consecutive_errors > 0);

  function handleHealthSort(field: SortField) {
    if (field === hSortField) {
      setHSortDir(hSortDir === "asc" ? "desc" : "asc");
    } else {
      setHSortField(field);
      setHSortDir(field === "name" || field === "type" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    const mul = hSortDir === "asc" ? 1 : -1;
    return [...activeSources].sort((a, b) => {
      switch (hSortField) {
        case "name":
          return mul * a.name.localeCompare(b.name);
        case "type":
          return mul * a.source_type.localeCompare(b.source_type);
        case "articles":
          return mul * (a.article_count - b.article_count);
        case "last_fetch": {
          const aT = a.last_fetched_at ? new Date(a.last_fetched_at).getTime() : 0;
          const bT = b.last_fetched_at ? new Date(b.last_fetched_at).getTime() : 0;
          return mul * (aT - bT);
        }
        case "latest_article": {
          const aT = a.latest_article_at ? new Date(a.latest_article_at).getTime() : 0;
          const bT = b.latest_article_at ? new Date(b.latest_article_at).getTime() : 0;
          return mul * (aT - bT);
        }
        case "errors":
          return mul * (a.consecutive_errors - b.consecutive_errors);
        case "status":
          return mul * (Number(a.active) - Number(b.active));
        default:
          return 0;
      }
    });
  }, [activeSources, hSortField, hSortDir]);

  // Recent run stats
  const recentErrors = logs.filter((l) => !l.success);
  const lastRunTime = logs.length > 0 ? logs[0].started_at : null;

  // Get logs for a specific source
  const logsForSource = (sourceId: string) =>
    logs.filter((l) => l.source_id === sourceId).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <div className="border border-ast-border rounded-lg p-3 bg-ast-surface">
          <div className="text-[10px] text-ast-muted uppercase tracking-wider mb-1">Sources</div>
          <div className="text-2xl font-bold text-ast-text">{activeSources.length}</div>
          <div className="text-[10px] text-ast-muted">{sources.length - activeSources.length} disabled</div>
        </div>
        <div className="border border-ast-border rounded-lg p-3 bg-ast-surface">
          <div className="text-[10px] text-ast-muted uppercase tracking-wider mb-1">Articles</div>
          <div className="text-2xl font-bold text-ast-text">{totalArticles}</div>
        </div>
        <div className="border border-ast-border rounded-lg p-3 bg-ast-surface">
          <div className="text-[10px] text-ast-muted uppercase tracking-wider mb-1">Healthy</div>
          <div className="text-2xl font-bold text-ast-mint">{healthy.length}</div>
          <div className="text-[10px] text-ast-muted">fetched &lt;{HEALTHY_HOURS}h ago</div>
        </div>
        <div className="border border-ast-border rounded-lg p-3 bg-ast-surface">
          <div className="text-[10px] text-ast-muted uppercase tracking-wider mb-1">Stale / Dead</div>
          <div className={`text-2xl font-bold ${stale.length + dead.length > 0 ? "text-ast-gold" : "text-ast-mint"}`}>
            {stale.length + dead.length}
          </div>
          <div className="text-[10px] text-ast-muted">{stale.length} stale, {dead.length} dead</div>
        </div>
        <div className="border border-ast-border rounded-lg p-3 bg-ast-surface">
          <div className="text-[10px] text-ast-muted uppercase tracking-wider mb-1">Errors</div>
          <div className={`text-2xl font-bold ${erroring.length > 0 ? "text-ast-pink" : "text-ast-mint"}`}>
            {erroring.length}
          </div>
          <div className="text-[10px] text-ast-muted">consecutive failures</div>
        </div>
      </div>

      {/* Last run info */}
      <div className="flex items-center gap-4 text-xs text-ast-muted px-1">
        <span>
          Last run: {lastRunTime ? (
            <span className={healthColor(lastRunTime)}>{timeAgo(lastRunTime)}</span>
          ) : (
            <span className="text-ast-pink">never</span>
          )}
        </span>
        {logs.length > 0 && (
          <>
            <span>•</span>
            <span>Recent logs: {logs.length} runs, {recentErrors.length} failures</span>
          </>
        )}
      </div>

      {/* Source health list */}
      <div className="border border-ast-border rounded-lg overflow-hidden">
        <div className="bg-ast-surface px-3 py-2 border-b border-ast-border flex items-center gap-3">
          <div className="w-5" /> {/* health dot */}
          <SortHeader label="Name" field="name" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="flex-1 min-w-0" />
          <SortHeader label="Type" field="type" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="w-16" />
          <SortHeader label="Articles" field="articles" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="w-24 justify-end" />
          <SortHeader label="Last Fetch" field="last_fetch" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="w-28 justify-end" />
          <div className="flex-1" />
          <SortHeader label="Latest Article" field="latest_article" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="w-28 justify-end" />
          <SortHeader label="Errors" field="errors" currentField={hSortField} currentDir={hSortDir} onSort={handleHealthSort} className="w-14 justify-end" />
          <div className="w-5" /> {/* expand arrow */}
        </div>
        <div className="divide-y divide-ast-border/50">
          {sorted.map((source) => (
            <div key={source.id}>
              <button
                onClick={() => setExpandedSource(expandedSource === source.id ? null : source.id)}
                className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-ast-surface/30 transition-colors text-left"
              >
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${healthDot(source.last_fetched_at)}`}
                  title={healthTooltip(source.last_fetched_at)}
                />
                <span className="text-sm text-ast-text flex-1 min-w-0 truncate">
                  {source.name}
                </span>
                <span className="text-[10px] text-ast-muted w-16">{source.source_type}</span>
                <span className="text-xs text-ast-muted w-24 text-right tabular-nums">{source.article_count}</span>
                <span className={`text-xs w-28 text-right ${healthColor(source.last_fetched_at)}`}>
                  {timeAgo(source.last_fetched_at)}
                </span>
                <div className="flex-1" />
                <span className="text-[10px] text-ast-muted w-28 text-right">
                  {source.latest_article_at ? timeAgo(source.latest_article_at) : "—"}
                </span>
                <span className="w-14 text-right">
                  {source.consecutive_errors > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-ast-pink/10 border border-ast-pink/30 text-ast-pink">
                      {source.consecutive_errors}×
                    </span>
                  ) : (
                    <span className="text-[10px] text-ast-muted">—</span>
                  )}
                </span>
                <span className="text-ast-muted text-xs w-5 text-center">
                  {expandedSource === source.id ? "▾" : "▸"}
                </span>
              </button>

              {/* Expanded detail: error info + recent logs */}
              {expandedSource === source.id && (
                <div className="px-4 pb-3 pt-1 bg-ast-surface/20 border-t border-ast-border/30">
                  {source.last_error && (
                    <div className="mb-2 p-2 rounded bg-ast-pink/5 border border-ast-pink/20">
                      <div className="text-[10px] text-ast-pink uppercase tracking-wider font-semibold mb-1">Last Error</div>
                      <div className="text-xs text-ast-text font-mono break-all">{source.last_error}</div>
                    </div>
                  )}

                  <div className="text-[10px] text-ast-muted uppercase tracking-wider font-semibold mb-1.5">
                    Recent Runs
                  </div>
                  {logsForSource(source.id).length === 0 ? (
                    <div className="text-xs text-ast-muted italic">No ingestion logs yet</div>
                  ) : (
                    <div className="space-y-1">
                      {logsForSource(source.id).map((log) => (
                        <div key={log.id} className="flex items-center gap-3 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full ${log.success ? "bg-ast-mint" : "bg-ast-pink"}`} />
                          <span className="text-ast-muted w-24">{timeAgo(log.started_at)}</span>
                          <span className="text-ast-text tabular-nums w-20">
                            {log.fetched} fetched
                          </span>
                          <span className="text-ast-accent tabular-nums w-20">
                            {log.inserted} new
                          </span>
                          <span className="text-ast-muted tabular-nums w-16">
                            {log.duration_ms}ms
                          </span>
                          {log.errors.length > 0 && (
                            <span className="text-ast-pink truncate flex-1" title={log.errors.join("; ")}>
                              {log.errors[0]}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {source.last_success_at && (
                    <div className="mt-2 text-[10px] text-ast-muted">
                      Last successful fetch: {timeAgo(source.last_success_at)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Sortable Column Header ──────────────────────────────────────────

function SortHeader({
  label,
  field,
  currentField,
  currentDir,
  onSort,
  className = "",
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  currentDir: SortDir;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold transition-colors ${
        isActive ? "text-ast-accent" : "text-ast-muted hover:text-ast-text"
      } ${className}`}
    >
      {label}
      {isActive && (
        <span className="text-ast-accent">{currentDir === "asc" ? "↑" : "↓"}</span>
      )}
    </button>
  );
}

// ── Main Admin Page ────────────────────────────────────────────────

export default function AdminPage() {
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [logs, setLogs] = useState<IngestionLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("sources");
  const [sortField, setSortField] = useState<SortField>("articles");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch("/api/sources");
      const data = await res.json();
      setSources(data.sources || []);
    } catch (err) {
      console.error("Failed to fetch sources:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/health/logs");
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
  }, []);

  useEffect(() => {
    fetchSources();
    fetchLogs();
  }, [fetchSources, fetchLogs]);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "name" || field === "type" ? "asc" : "desc");
    }
  }

  const sortedSources = useMemo(() => {
    const mul = sortDir === "asc" ? 1 : -1;
    return [...sources].sort((a, b) => {
      switch (sortField) {
        case "name":
          return mul * a.name.localeCompare(b.name);
        case "type":
          return mul * a.source_type.localeCompare(b.source_type);
        case "articles":
          return mul * (a.article_count - b.article_count);
        case "last_fetch": {
          const aT = a.last_fetched_at ? new Date(a.last_fetched_at).getTime() : 0;
          const bT = b.last_fetched_at ? new Date(b.last_fetched_at).getTime() : 0;
          return mul * (aT - bT);
        }
        case "latest_article": {
          const aT = a.latest_article_at ? new Date(a.latest_article_at).getTime() : 0;
          const bT = b.latest_article_at ? new Date(b.latest_article_at).getTime() : 0;
          return mul * (aT - bT);
        }
        case "status":
          return mul * (Number(a.active) - Number(b.active));
        default:
          return 0;
      }
    });
  }, [sources, sortField, sortDir]);

  async function toggleSource(id: string, active: boolean) {
    await fetch("/api/sources", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active: !active }),
    });
    fetchSources();
  }

  async function deleteSource(id: string) {
    try {
      const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        alert(`Delete failed: ${data.error}`);
        return;
      }
    } catch (err) {
      alert("Delete failed — network error");
      return;
    }
    fetchSources();
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-ast-muted hover:text-ast-accent transition-colors text-xs">
              ← Terminal
            </Link>
            <span className="text-ast-border">|</span>
            <div className="flex items-center gap-2">
              <span className="text-ast-accent text-lg">⚙</span>
              <h1 className="font-semibold text-lg tracking-tight">
                <span className="text-ast-text">Admin</span>
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-ast-border bg-ast-bg/95 sticky top-[53px] z-40">
        <div className="max-w-5xl mx-auto px-4 flex gap-0">
          <button
            onClick={() => setTab("sources")}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === "sources"
                ? "border-ast-accent text-ast-accent"
                : "border-transparent text-ast-muted hover:text-ast-text"
            }`}
          >
            Sources
          </button>
          <button
            onClick={() => setTab("health")}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === "health"
                ? "border-ast-accent text-ast-accent"
                : "border-transparent text-ast-muted hover:text-ast-text"
            }`}
          >
            Ingestion Health
          </button>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12 text-ast-muted text-sm">Loading...</div>
        ) : tab === "sources" ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ast-text">
                {sources.length} Sources
              </h2>
              <AddSourceForm onAdded={fetchSources} />
            </div>

            {/* Sortable table header */}
            <div className="border border-ast-border rounded-lg overflow-hidden">
              <div className="bg-ast-surface px-3 py-2 border-b border-ast-border flex items-center gap-3">
                <div className="w-5" /> {/* health dot */}
                <SortHeader label="Name" field="name" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="flex-1 min-w-0" />
                <SortHeader label="Type" field="type" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-20" />
                <SortHeader label="Articles" field="articles" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-20 justify-end" />
                <SortHeader label="Last Fetch" field="last_fetch" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-24 justify-end" />
                <SortHeader label="Latest Article" field="latest_article" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-28 justify-end" />
                <SortHeader label="Status" field="status" currentField={sortField} currentDir={sortDir} onSort={handleSort} className="w-16 justify-center" />
                <div className="w-[120px]" /> {/* actions */}
              </div>

              <div className="divide-y divide-ast-border/50">
                {sortedSources.map((source) => (
                  <SourceTableRow
                    key={source.id}
                    source={source}
                    onToggle={() => toggleSource(source.id, source.active)}
                    onDelete={() => deleteSource(source.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <HealthDashboard sources={sources} logs={logs} />
        )}
      </main>
    </div>
  );
}

// ── Source Table Row ────────────────────────────────────────────────

function SourceTableRow({
  source,
  onToggle,
  onDelete,
}: {
  source: SourceRow;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`px-3 py-2.5 flex items-center gap-3 hover:bg-ast-surface/30 transition-colors ${
        !source.active ? "opacity-50" : ""
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${healthDot(source.last_fetched_at)}`}
        title={healthTooltip(source.last_fetched_at)}
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm text-ast-text truncate">{source.name}</div>
        <div className="text-[10px] text-ast-muted truncate">{source.feed_url}</div>
      </div>

      <span className="text-[10px] text-ast-muted w-20">{source.source_type}</span>

      <span className="text-xs text-ast-text w-20 text-right tabular-nums">{source.article_count}</span>

      <span className={`text-xs w-24 text-right ${healthColor(source.last_fetched_at)}`}>
        {timeAgo(source.last_fetched_at)}
      </span>

      <span className="text-xs text-ast-muted w-28 text-right">
        {source.latest_article_at ? timeAgo(source.latest_article_at) : "—"}
      </span>

      <span className="w-16 text-center">
        {source.active ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ast-mint/10 border border-ast-mint/30 text-ast-mint">on</span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-ast-pink/10 border border-ast-pink/30 text-ast-pink">off</span>
        )}
      </span>

      <div className="w-[120px] flex items-center justify-end gap-1">
        <button
          onClick={onToggle}
          className={`px-2 py-1 text-[10px] rounded border transition-colors ${
            source.active
              ? "border-ast-gold/30 text-ast-gold hover:bg-ast-gold/10"
              : "border-ast-mint/30 text-ast-mint hover:bg-ast-mint/10"
          }`}
        >
          {source.active ? "Disable" : "Enable"}
        </button>

        {confirming ? (
          <div className="flex gap-1">
            <button
              onClick={() => { onDelete(); setConfirming(false); }}
              className="px-2 py-1 text-[10px] rounded border border-ast-pink text-ast-pink hover:bg-ast-pink/10 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="px-2 py-1 text-[10px] rounded border border-ast-border text-ast-muted transition-colors"
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="px-2 py-1 text-[10px] rounded border border-ast-border text-ast-muted hover:border-ast-pink hover:text-ast-pink transition-colors"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
