"use client";

import { useMemo, useState, useEffect } from "react";
import type { FeedItem } from "@/lib/database.types";
import { clusterItems, type StoryCluster } from "@/lib/cluster";
import { scoreCluster, getClusterScoreBreakdown, type ScoreBreakdown } from "@/lib/importance";
import { CompanyTag } from "./CompanyTag";
import { SourceFavicon } from "./SourceFavicon";
import { TimeAgo } from "./TimeAgo";
import {
  DEFAULT_EXPANSION,
  getHiddenCount,
  readExpansion,
  sliceVisible,
  toggleSection,
  writeExpansion,
  type ExpansionState,
  type SectionId,
} from "@/lib/sectionExpansion";
import { getSignalChip, getSignalStripeClass } from "@/lib/chip-styles";

interface SignalPanelProps {
  items: FeedItem[];
}

interface TopStory {
  id: string;
  title: string;
  sourceCount: number;
  articleCount: number;
  companies: string[];
  publishedAt: string | null;
  trending: "up" | "stable" | "new";
  importanceScore: number;
  breakdown: ScoreBreakdown;
  sourceNames: string[];
  leadUrl: string;
  relatedArticles: { title: string; source: string; url: string }[];
}

interface WorthReading {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  sourceType: string;
  importanceScore: number;
  url: string;
}

interface DbSignal {
  id: string;
  signal_type: string;
  summary: string;
  investment_relevance_score: number;
  companies: string[];
  title: string;
  url: string;
  published_at: string | null;
  created_at: string | null;
}

function getHoursAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60));
}

// Chip label + class for a signal type come from the shared literal map so the
// Signals list and the Deals section render the same chip (see chip-styles.ts).
function getSignalBadge(signalType: string): { label: string; className: string } {
  return getSignalChip(signalType);
}

function getSignalBorderColor(signalType: string): string {
  return getSignalStripeClass(signalType);
}

function formatSignalType(signalType: string): string {
  return signalType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ScoreBreakdownPanel({ 
  breakdown, 
  leadUrl,
  relatedArticles 
}: { 
  breakdown: ScoreBreakdown; 
  leadUrl: string;
  relatedArticles: { title: string; source: string; url: string }[];
}) {
  return (
    <div className="mt-2 p-2 bg-ast-surface/80 rounded border border-ast-border/50 text-[10px]">
      {/* Why it ranked */}
      <div className="text-ast-muted mb-1.5 font-medium">Why this ranked</div>
      <div className="space-y-1 mb-3">
        {breakdown.factors.map((factor, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <span className="text-ast-text">
              {factor.label}
              {factor.detail && <span className="text-ast-muted ml-1">({factor.detail})</span>}
            </span>
            <span className="text-ast-gold">+{(factor.value * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
      
      {/* All articles in cluster */}
      <div className="pt-2 border-t border-ast-border/50">
        <div className="text-ast-muted mb-1.5 font-medium">
          {relatedArticles.length + 1} article{relatedArticles.length > 0 ? "s" : ""} in cluster
        </div>
        <div className="space-y-1.5">
          <a 
            href={leadUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="block text-ast-accent hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            → Lead article ↗
          </a>
          {relatedArticles.map((article, i) => (
            <a
              key={i}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-ast-text hover:text-ast-accent transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              → {article.source}: {article.title.slice(0, 60)}{article.title.length > 60 ? "..." : ""} ↗
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

type SourceFilter = "all" | "analysis" | "news" | "watchlist";

const FILTER_CHIPS: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "analysis", label: "Analysis" },
  { value: "news", label: "News" },
  { value: "watchlist", label: "★ Watchlist" },
];

/** Shape of the subset of GET /api/v1/watchlist this component needs. */
interface WatchlistApiEntry {
  entity?: { canonical_name?: string | null; ticker?: string | null } | null;
}

/**
 * Inline "Show N more" / "Show less" control for a capped section. Renders
 * nothing when the section fits inside the collapsed cap. `aria-expanded`
 * conveys the state and the button is a plain toggle, so expanding never
 * remounts the scroll container (the panel keeps its scroll position and the
 * content below simply grows).
 */
function SectionToggle({
  hidden,
  expanded,
  onToggle,
  accentClass,
}: {
  hidden: number;
  expanded: boolean;
  onToggle: () => void;
  accentClass: string;
}) {
  if (!expanded && hidden <= 0) return null;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className={`text-[11px] font-medium px-2 py-1 rounded border border-transparent hover:border-ast-border transition-colors ${accentClass}`}
    >
      {expanded ? "Show less" : `Show ${hidden} more`}
    </button>
  );
}

export function SignalPanel({ items }: SignalPanelProps) {
  const [expandedStory] = useState<string | null>(null); // kept for future use
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [signals, setSignals] = useState<DbSignal[]>([]);
  // Lowercased canonical names + tickers of the companies the user watches.
  const [watchedNames, setWatchedNames] = useState<Set<string>>(new Set());
  // Per-section collapsed/expanded state for the capped signals/deals lists.
  // Starts collapsed so first render matches the server output; the persisted
  // choice is applied after mount to stay SSR/hydration safe.
  const [expansion, setExpansion] = useState<ExpansionState>(DEFAULT_EXPANSION);

  // Restore the remembered expansion state. Read after mount so the initial
  // render (and any server-rendered HTML) is deterministic.
  useEffect(() => {
    const storage = typeof window !== "undefined" ? window.sessionStorage : null;
    setExpansion(readExpansion(storage));
  }, []);

  const handleToggleSection = (section: SectionId) => {
    setExpansion((prev) => {
      const next = toggleSection(prev, section);
      const storage = typeof window !== "undefined" ? window.sessionStorage : null;
      writeExpansion(storage, next);
      return next;
    });
  };

  // Fetch DB signals
  useEffect(() => {
    fetch("/api/v1/signals")
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => setSignals([]));
  }, []);

  // Fetch the user's watchlist so the "Watchlist" chip can match company names.
  // Degrades silently to an empty set for signed-out users / API failures.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/watchlist", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const names = new Set<string>();
        const entries: WatchlistApiEntry[] = Array.isArray(data?.data) ? data.data : [];
        for (const entry of entries) {
          const name = entry?.entity?.canonical_name;
          const ticker = entry?.entity?.ticker;
          if (name) names.add(name.toLowerCase());
          if (ticker) names.add(ticker.toLowerCase());
        }
        setWatchedNames(names);
      })
      .catch(() => {
        if (!cancelled) setWatchedNames(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Signals after the active chip filter. "Watchlist" keeps only signals whose
  // companies array intersects the watched canonical names/tickers.
  const visibleSignals = useMemo(() => {
    if (sourceFilter !== "watchlist") return signals;
    return signals.filter((signal) =>
      (signal.companies || []).some((company) =>
        watchedNames.has(company.toLowerCase())
      )
    );
  }, [signals, sourceFilter, watchedNames]);
  
  // Filter items by source type
  const filteredItems = useMemo(() => {
    if (sourceFilter === "all" || sourceFilter === "watchlist") return items;
    const analysisTypes = new Set(["newsletter", "analysis", "blog"]);
    return items.filter((item) => {
      const sourceType = item.sources?.source_type || "news";
      if (sourceFilter === "analysis") {
        return analysisTypes.has(sourceType);
      } else {
        return !analysisTypes.has(sourceType);
      }
    });
  }, [items, sourceFilter]);

  // Compute top stories from multi-source clusters
  const topStories = useMemo<TopStory[]>(() => {
    const clusters = clusterItems(filteredItems);
    const scored = clusters.map((c) => ({
      ...c,
      importanceScore: scoreCluster(c),
    }));
    
    const significant = scored.filter(
      (c) => c.isMultiSource || c.importanceScore > 0.6
    );
    
    significant.sort((a, b) => b.importanceScore - a.importanceScore);
    
    return significant.slice(0, 5).map((c) => {
      const tags = (c.lead.tags as Record<string, string[]>) || {};
      const companies = tags.company || [];
      const hoursAgo = getHoursAgo(c.lead.published_at);
      const breakdown = getClusterScoreBreakdown(c);
      
      const relatedArticles = c.related.map((item) => ({
        title: item.title,
        source: item.sources?.name || "Unknown",
        url: item.url,
      }));
      
      return {
        id: c.id,
        title: c.lead.title,
        sourceCount: c.sourceCount,
        articleCount: 1 + c.related.length,
        companies: companies.slice(0, 3),
        publishedAt: c.lead.published_at,
        trending: hoursAgo < 3 ? "new" : hoursAgo < 12 ? "up" : "stable",
        importanceScore: c.importanceScore,
        breakdown,
        sourceNames: c.sourceNames,
        leadUrl: c.lead.url,
        relatedArticles,
      };
    });
  }, [filteredItems]);

  // Compute "worth reading" from newsletters/analysis
  const worthReading = useMemo<WorthReading[]>(() => {
    const analysisTypes = new Set(["newsletter", "analysis", "blog"]);
    
    const analysisItems = filteredItems.filter((item) => {
      const sourceType = item.sources?.source_type || "news";
      return analysisTypes.has(sourceType);
    });
    
    const scored = analysisItems.map((item) => ({
      item,
      score: scoreCluster({ 
        id: item.id, 
        lead: item, 
        related: [], 
        isMultiSource: false, 
        sourceCount: 1,
        sourceNames: [item.sources?.name || ""],
      }),
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, 5).map(({ item, score }) => ({
      id: item.id,
      title: item.title,
      source: item.sources?.name || "Unknown",
      sourceUrl: item.sources?.url || "",
      sourceType: item.sources?.source_type || "analysis",
      importanceScore: score,
      url: item.url,
    }));
  }, [filteredItems]);

  // Compute deals from signals table (fundraising, acquisition, earnings)
  const dealSignals = useMemo(() => {
    return visibleSignals.filter((s) =>
      ["fundraising", "acquisition", "earnings"].includes(s.signal_type)
    );
  }, [visibleSignals]);

  // Capped views: each section renders the top N (collapsed) or every item
  // (expanded). The signals fetch already returns up to the API's default
  // limit, so expanding never triggers another request.
  const shownSignals = useMemo(
    () => sliceVisible(visibleSignals, expansion.signals),
    [visibleSignals, expansion.signals]
  );
  const shownDeals = useMemo(
    () => sliceVisible(dealSignals, expansion.deals),
    [dealSignals, expansion.deals]
  );
  const hiddenSignals = getHiddenCount(visibleSignals.length, expansion.signals);
  const hiddenDeals = getHiddenCount(dealSignals.length, expansion.deals);

  // Stats
  const stats = useMemo(() => {
    const sources = new Set(filteredItems.map((i) => i.sources?.name).filter(Boolean));
    const clusters = clusterItems(filteredItems);
    return {
      articles: filteredItems.length,
      sources: sources.size,
      clusters: clusters.length,
    };
  }, [filteredItems]);

  return (
    <div className="h-full flex flex-col bg-ast-bg">

      
      <div className="flex-1 overflow-y-auto flex flex-col">
        <div className="max-w-5xl mx-auto w-full">
          {/* DB Signals Section */}
          <div className="border-b border-ast-border">
            <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50 flex items-center gap-1.5 flex-wrap">
              <span className="text-ast-accent text-xs font-semibold tracking-wide mr-1">
                ⚡ SIGNALS · {visibleSignals.length}
              </span>
              {FILTER_CHIPS.map(({ value, label }) => {
                const active = sourceFilter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSourceFilter(value)}
                    aria-pressed={active}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? "bg-ast-accent/20 border-ast-accent/40 text-ast-accent"
                        : "border-ast-border text-ast-muted hover:text-ast-text hover:border-ast-accent/40"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="px-4 py-3 space-y-3">
              {visibleSignals.length === 0 ? (
                <p className="text-ast-muted text-xs">
                  {sourceFilter === "watchlist"
                    ? "No signals for the companies you watch yet. Watch more companies to widen the net."
                    : "No signals extracted yet"}
                </p>
              ) : (
                shownSignals.map((signal) => {
                  const badge = getSignalBadge(signal.signal_type);
                  const scoreColor = signal.investment_relevance_score >= 0.8 
                    ? "text-ast-mint" 
                    : "text-ast-gold";
                  
                  return (
                    <div
                      key={signal.id}
                      onClick={() => window.open(signal.url, '_blank', 'noopener,noreferrer')}
                      className={`block group rounded hover:bg-ast-mint/5 cursor-pointer transition-colors -mx-2 px-2 border-l-2 ${getSignalBorderColor(signal.signal_type)}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={badge.className}>
                          {badge.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-ast-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-ast-accent transition-colors">
                            {signal.summary}
                          </p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <div className="relative inline-flex group/tip">
                              <span
                                className={`${scoreColor} text-[10px] cursor-help`}
                                title="Signal confidence: 0–1 scale. Higher = stronger evidence of a market-moving event."
                              >
                                ● {signal.investment_relevance_score.toFixed(2)}
                              </span>
                              <div className="absolute left-0 top-full mt-1 hidden group-hover/tip:block z-50">
                                <div className="px-3 py-2 rounded text-[10px] min-w-[210px] border border-ast-border bg-ast-surface shadow-lg text-ast-text">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-baseline justify-between">
                                      <span className="text-ast-muted">Relevance</span>
                                      <span className={`text-sm font-bold ${scoreColor}`}>
                                        {signal.investment_relevance_score.toFixed(2)}
                                      </span>
                                    </div>
                                    <div className="flex items-baseline justify-between">
                                      <span className="text-ast-muted">Signal</span>
                                      <span className="text-ast-text font-medium">
                                        {formatSignalType(signal.signal_type)}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="mt-1.5 pt-1.5 border-t border-ast-border/50 text-ast-muted leading-snug">
                                    Signal confidence: 0–1 scale. Higher = stronger evidence of a market-moving event.
                                  </div>
                                </div>
                              </div>
                            </div>
                            {(signal.published_at || signal.created_at) && (
                              <TimeAgo
                                date={signal.published_at || signal.created_at}
                                relativeOnly
                                className="text-ast-muted text-[10px]"
                              />
                            )}
                            {signal.companies.length > 0 && (
                              <div className="flex gap-1">
                                {signal.companies.slice(0, 3).map((c) => (
                                  <CompanyTag key={c} name={c} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <SectionToggle
                hidden={hiddenSignals}
                expanded={expansion.signals}
                onToggle={() => handleToggleSection("signals")}
                accentClass="text-ast-accent"
              />


            </div>
          </div>
  
          {/* Deals */}
          <div className="border-b border-ast-border">
            <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
              <span className="text-ast-gold text-xs font-semibold tracking-wide">
                💰 DEALS · {dealSignals.length}
              </span>
            </div>
            <div className="px-4 py-3 space-y-3">
              {dealSignals.length === 0 ? (
                <p className="text-ast-muted text-xs">No deals or earnings yet</p>
              ) : (
                shownDeals.map((deal) => {
                  const chip = getSignalChip(deal.signal_type);
                  return (
                  <div
                    key={deal.id}
                    onClick={() => window.open(deal.url, '_blank', 'noopener,noreferrer')}
                    className={`block group border-l-2 cursor-pointer ${getSignalBorderColor(deal.signal_type)}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={chip.className}>
                        {chip.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ast-text text-sm font-medium leading-snug line-clamp-2 group-hover:text-ast-accent transition-colors">
                          {deal.summary}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {deal.companies.length > 0 && (
                            <span className="text-ast-muted text-[10px]">{deal.companies.slice(0, 2).join(", ")}</span>
                          )}
                          {(deal.published_at || deal.created_at) && (
                            <TimeAgo
                              date={deal.published_at || deal.created_at}
                              relativeOnly
                              className="text-ast-muted text-[10px]"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  );
                })
              )}
              <SectionToggle
                hidden={hiddenDeals}
                expanded={expansion.deals}
                onToggle={() => handleToggleSection("deals")}
                accentClass="text-ast-gold"
              />
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}