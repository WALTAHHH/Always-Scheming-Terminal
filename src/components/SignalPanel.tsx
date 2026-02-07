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

interface Deal {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  category: "fundraising" | "m-and-a" | "earnings";
  companies: string[];
  publishedAt: string | null;
  url: string;
}

function getHoursAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60));
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
type MiddleTab = "deals" | "reading";

export function SignalPanel({ items }: SignalPanelProps) {
  const [expandedStory, setExpandedStory] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [middleTab, setMiddleTab] = useState<MiddleTab>("deals");
  
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

  // Compute deals (Fundraising, M&A, Earnings)
  const deals = useMemo<Deal[]>(() => {
    const dealCategories = new Set(["fundraising", "m-and-a", "earnings"]);
    
    const dealItems = filteredItems.filter((item) => {
      const tags = (item.tags as Record<string, string[]>) || {};
      const categories = tags.category || [];
      return categories.some((c) => dealCategories.has(c));
    });
    
    dealItems.sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0;
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0;
      return bTime - aTime;
    });
    
    return dealItems.slice(0, 5).map((item) => {
      const tags = (item.tags as Record<string, string[]>) || {};
      const categories = tags.category || [];
      const category = categories.find((c) => dealCategories.has(c)) as Deal["category"] || "fundraising";
      
      return {
        id: item.id,
        title: item.title,
        source: item.sources?.name || "Unknown",
        sourceUrl: item.sources?.url || "",
        category,
        companies: (tags.company || []).slice(0, 3),
        publishedAt: item.published_at,
        url: item.url,
      };
    });
  }, [filteredItems]);

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
        <div className="flex items-center gap-3">
          <span className="text-ast-text text-sm font-semibold tracking-wide">SIGNAL</span>
          <div className="flex items-center border border-ast-border rounded overflow-hidden">
            <button
              onClick={() => setSourceFilter("all")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                sourceFilter === "all"
                  ? "bg-ast-accent/15 text-ast-accent"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              ALL
            </button>
            <div className="w-px h-3 bg-ast-border" />
            <button
              onClick={() => setSourceFilter("analysis")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                sourceFilter === "analysis"
                  ? "bg-ast-pink/15 text-ast-pink"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              ANALYSIS
            </button>
            <div className="w-px h-3 bg-ast-border" />
            <button
              onClick={() => setSourceFilter("news")}
              className={`px-2 py-0.5 text-[10px] font-medium transition-colors ${
                sourceFilter === "news"
                  ? "bg-ast-gold/15 text-ast-gold"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              NEWS
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ast-muted text-[10px]">
            {stats.clusters}s · {stats.sources}src
          </span>
          <span className="text-ast-accent text-[10px]">●</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Top Stories */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
            <span className="text-ast-accent text-xs font-semibold tracking-wide">
              TOP STORIES
            </span>
          </div>
          <div className="px-4 py-3 space-y-4">
            {topStories.length === 0 ? (
              <p className="text-ast-muted text-xs">No significant stories yet</p>
            ) : (
              topStories.map((story, idx) => (
                <div key={story.id} className="group">
                  <div 
                    className="flex items-start gap-2 cursor-pointer"
                    onClick={() => setExpandedStory(expandedStory === story.id ? null : story.id)}
                  >
                    <span className="text-ast-muted text-[10px] mt-0.5">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ast-text text-xs font-medium leading-tight line-clamp-2 group-hover:text-ast-accent transition-colors">
                        {story.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-ast-gold text-[10px]">
                          [{story.sourceCount}] {story.articleCount}a
                        </span>
                        <TimeAgo date={story.publishedAt} className="text-ast-muted text-[10px]" />
                        {story.trending === "new" && (
                          <span className="text-ast-pink text-[10px]">▲ new</span>
                        )}
                        {story.trending === "up" && (
                          <span className="text-ast-mint text-[10px]">▲ trending</span>
                        )}
                        <span className="text-ast-muted/50 text-[10px] ml-auto">
                          {expandedStory === story.id ? "▼" : "▶"} why?
                        </span>
                      </div>
                      {story.sourceNames.length > 0 && (
                        <div className="text-[10px] text-ast-muted mt-1">
                          via {story.sourceNames.slice(0, 3).join(", ")}
                          {story.sourceNames.length > 3 && ` +${story.sourceNames.length - 3}`}
                        </div>
                      )}
                      {story.companies.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {story.companies.map((c) => (
                            <CompanyTag key={c} name={c} />
                          ))}
                        </div>
                      )}
                      {expandedStory === story.id && (
                        <ScoreBreakdownPanel 
                          breakdown={story.breakdown} 
                          leadUrl={story.leadUrl}
                          relatedArticles={story.relatedArticles}
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Deals + Reading - Tabbed Section */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50 flex items-center gap-3">
            <button
              onClick={() => setMiddleTab("deals")}
              className={`text-xs font-semibold tracking-wide transition-colors ${
                middleTab === "deals" ? "text-ast-gold" : "text-ast-muted hover:text-ast-text"
              }`}
            >
              💰 DEALS
              {deals.length > 0 && (
                <span className={`ml-1 text-[10px] ${middleTab === "deals" ? "text-ast-gold/70" : "text-ast-muted"}`}>
                  ({deals.length})
                </span>
              )}
            </button>
            <span className="text-ast-border">|</span>
            <button
              onClick={() => setMiddleTab("reading")}
              className={`text-xs font-semibold tracking-wide transition-colors ${
                middleTab === "reading" ? "text-ast-pink" : "text-ast-muted hover:text-ast-text"
              }`}
            >
              📖 READING
              {worthReading.length > 0 && (
                <span className={`ml-1 text-[10px] ${middleTab === "reading" ? "text-ast-pink/70" : "text-ast-muted"}`}>
                  ({worthReading.length})
                </span>
              )}
            </button>
          </div>
          
          <div className="px-4 py-3 space-y-3">
            {middleTab === "deals" ? (
              deals.length === 0 ? (
                <p className="text-ast-muted text-xs">No deals or earnings yet</p>
              ) : (
                deals.map((deal) => (
                  <a
                    key={deal.id}
                    href={deal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                        deal.category === "fundraising" 
                          ? "bg-ast-mint/20 text-ast-mint" 
                          : deal.category === "m-and-a"
                          ? "bg-ast-pink/20 text-ast-pink"
                          : "bg-ast-gold/20 text-ast-gold"
                      }`}>
                        {deal.category === "m-and-a" ? "M&A" : deal.category === "fundraising" ? "RAISE" : "EARN"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-ast-text text-xs leading-tight line-clamp-2 group-hover:text-ast-accent transition-colors">
                          {deal.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <SourceFavicon url={deal.sourceUrl} size={12} />
                          <span className="text-ast-muted text-[10px]">{deal.source}</span>
                          <TimeAgo date={deal.publishedAt} className="text-ast-muted text-[10px]" />
                        </div>
                      </div>
                    </div>
                  </a>
                ))
              )
            ) : (
              worthReading.length === 0 ? (
                <p className="text-ast-muted text-xs">No analysis pieces yet</p>
              ) : (
                worthReading.map((item) => (
                  <a 
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <p className="text-ast-text text-xs leading-tight line-clamp-2 group-hover:text-ast-accent transition-colors">
                      ▹ {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <SourceFavicon url={item.sourceUrl} size={12} />
                      <span className="text-ast-muted text-[10px]">{item.source}</span>
                      <span className="text-ast-muted/50 text-[10px]">·</span>
                      <span className="text-ast-gold text-[10px]">{item.importanceScore.toFixed(2)}</span>
                    </div>
                  </a>
                ))
              )
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
