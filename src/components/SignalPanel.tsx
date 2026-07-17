"use client";

import { useMemo, useState, useEffect } from "react";
import type { FeedItem } from "@/lib/database.types";
import { clusterItems, type StoryCluster } from "@/lib/cluster";
import { scoreCluster, getClusterScoreBreakdown, type ScoreBreakdown } from "@/lib/importance";
import { CompanyTag } from "./CompanyTag";
import { SourceFavicon } from "./SourceFavicon";
import { TimeAgo } from "./TimeAgo";

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

function getSignalBadge(signalType: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    acquisition: { label: "ACQ", color: "ast-mint" },
    fundraising: { label: "RAISE", color: "ast-gold" },
    earnings: { label: "EARN", color: "ast-gold" },
    layoffs: { label: "LAYOFF", color: "ast-pink" },
    leadership: { label: "LEAD", color: "ast-muted" },
    product_launch: { label: "LAUNCH", color: "ast-mint" },
    regulatory: { label: "REG", color: "ast-pink" },
    platform_change: { label: "PLATFORM", color: "ast-muted" },
    macro: { label: "MACRO", color: "ast-muted" },
  };
  return map[signalType] || { label: signalType.toUpperCase().slice(0, 6), color: "ast-muted" };
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

type SourceFilter = "all" | "analysis" | "news";

export function SignalPanel({ items }: SignalPanelProps) {
  const [expandedStory] = useState<string | null>(null); // kept for future use
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [signals, setSignals] = useState<DbSignal[]>([]);
  
  // Fetch DB signals
  useEffect(() => {
    fetch("/api/v1/signals")
      .then((r) => r.json())
      .then((data) => setSignals(data.signals || []))
      .catch(() => setSignals([]));
  }, []);
  
  // Filter items by source type
  const filteredItems = useMemo(() => {
    if (sourceFilter === "all") return items;
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
    return signals.filter((s) =>
      ["fundraising", "acquisition", "earnings"].includes(s.signal_type)
    );
  }, [signals]);

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
      {/* Header */}
      <div className="h-11 px-4 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm flex items-center justify-between">
        <span className="text-ast-text text-sm font-semibold tracking-wide">SIGNAL</span>
        <span className="text-ast-accent text-[10px]">●</span>
      </div>
      
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* DB Signals Section */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
            <span className="text-ast-accent text-xs font-semibold tracking-wide">
              SIGNALS
            </span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {signals.length === 0 ? (
              <p className="text-ast-muted text-xs">No signals extracted yet</p>
            ) : (
              signals.slice(0, 10).map((signal) => {
                const badge = getSignalBadge(signal.signal_type);
                const scoreColor = signal.investment_relevance_score >= 0.8 
                  ? "text-ast-mint" 
                  : "text-ast-gold";
                
                return (
                  <a
                    key={signal.id}
                    href={signal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group rounded hover:bg-ast-mint/5 transition-colors -mx-2 px-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 bg-${badge.color}/20 text-${badge.color}`}>
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ast-text text-xs leading-tight line-clamp-1 group-hover:text-ast-accent transition-colors">
                          {signal.summary}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className={`${scoreColor} text-[10px]`}>
                            ● {signal.investment_relevance_score.toFixed(2)}
                          </span>
                          {signal.created_at && (
                            <TimeAgo date={signal.created_at} className="text-ast-muted text-[10px]" />
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
                  </a>
                );
              })
            )}
            {signals.length > 10 && (
              <p className="text-ast-muted text-[10px] text-center pt-1">
                +{signals.length - 10} more —{" "}
                <a href="/api-explorer" className="text-ast-accent hover:underline">API Explorer</a>
              </p>
            )}
          </div>
        </div>

        {/* Deals */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
            <span className="text-ast-gold text-xs font-semibold tracking-wide">
              💰 DEALS
              {dealSignals.length > 0 && (
                <span className="ml-1 text-[10px] text-ast-gold/70">({dealSignals.length})</span>
              )}
            </span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {dealSignals.length === 0 ? (
              <p className="text-ast-muted text-xs">No deals or earnings yet</p>
            ) : (
              dealSignals.map((deal) => (
                <a
                  key={deal.id}
                  href={deal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="flex items-start gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                      deal.signal_type === "fundraising"
                        ? "bg-ast-mint/20 text-ast-mint"
                        : deal.signal_type === "acquisition"
                        ? "bg-ast-pink/20 text-ast-pink"
                        : "bg-ast-gold/20 text-ast-gold"
                    }`}>
                      {deal.signal_type === "acquisition" ? "M&A" : deal.signal_type === "fundraising" ? "RAISE" : "EARN"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ast-text text-xs leading-tight line-clamp-2 group-hover:text-ast-accent transition-colors">
                        {deal.summary}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {deal.companies.length > 0 && (
                          <span className="text-ast-muted text-[10px]">{deal.companies.slice(0, 2).join(", ")}</span>
                        )}
                        {deal.created_at && (
                          <TimeAgo date={deal.created_at} className="text-ast-muted text-[10px]" />
                        )}
                      </div>
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}