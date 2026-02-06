"use client";

import { useMemo } from "react";
import type { FeedItem } from "@/lib/database.types";
import { clusterItems, type StoryCluster } from "@/lib/cluster";
import { scoreCluster } from "@/lib/importance";

interface SignalPanelProps {
  items: FeedItem[];
}

interface TopStory {
  id: string;
  title: string;
  sourceCount: number;
  articleCount: number;
  companies: string[];
  hoursAgo: number;
  trending: "up" | "stable" | "new";
  importanceScore: number;
}

interface WorthReading {
  id: string;
  title: string;
  source: string;
  sourceType: string;
  importanceScore: number;
  url: string;
}

interface TrendingCompany {
  name: string;
  mentions: number;
  maxMentions: number;
}

function getHoursAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60));
}

function formatHoursAgo(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function ImportanceBar({ score, color = "accent" }: { score: number; color?: "accent" | "gold" | "pink" }) {
  const width = Math.min(Math.max(score * 100, 5), 100);
  const colorClass = {
    accent: "bg-ast-accent",
    gold: "bg-ast-gold",
    pink: "bg-ast-pink",
  }[color];
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-ast-border rounded-sm overflow-hidden">
        <div 
          className={`h-full ${colorClass} rounded-sm`} 
          style={{ width: `${width}%` }} 
        />
      </div>
      <span className="text-ast-muted text-[10px] w-8">{score.toFixed(2)}</span>
    </div>
  );
}

export function SignalPanel({ items }: SignalPanelProps) {
  // Compute top stories from multi-source clusters
  const topStories = useMemo<TopStory[]>(() => {
    const clusters = clusterItems(items);
    const scored = clusters.map((c) => ({
      ...c,
      importanceScore: scoreCluster(c),
    }));
    
    // Filter for multi-source or high importance
    const significant = scored.filter(
      (c) => c.isMultiSource || c.importanceScore > 0.6
    );
    
    // Sort by importance
    significant.sort((a, b) => b.importanceScore - a.importanceScore);
    
    // Take top 5
    return significant.slice(0, 5).map((c) => {
      const tags = (c.lead.tags as Record<string, string[]>) || {};
      const companies = tags.company || [];
      const hoursAgo = getHoursAgo(c.lead.published_at);
      
      return {
        id: c.id,
        title: c.lead.title,
        sourceCount: c.sourceCount,
        articleCount: 1 + c.related.length,
        companies: companies.slice(0, 3),
        hoursAgo,
        trending: hoursAgo < 3 ? "new" : hoursAgo < 12 ? "up" : "stable",
        importanceScore: c.importanceScore,
      };
    });
  }, [items]);

  // Compute "worth reading" from newsletters/analysis
  const worthReading = useMemo<WorthReading[]>(() => {
    const analysisTypes = new Set(["newsletter", "analysis", "blog"]);
    
    const analysisItems = items.filter((item) => {
      const sourceType = item.sources?.source_type || "news";
      return analysisTypes.has(sourceType);
    });
    
    // Score individually and sort
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
    
    return scored.slice(0, 4).map(({ item, score }) => ({
      id: item.id,
      title: item.title,
      source: item.sources?.name || "Unknown",
      sourceType: item.sources?.source_type || "analysis",
      importanceScore: score,
      url: item.url,
    }));
  }, [items]);

  // Compute trending companies
  const trendingCompanies = useMemo<TrendingCompany[]>(() => {
    const counts: Record<string, number> = {};
    
    for (const item of items) {
      const tags = (item.tags as Record<string, string[]>) || {};
      const companies = tags.company || [];
      for (const company of companies) {
        counts[company] = (counts[company] || 0) + 1;
      }
    }
    
    const sorted = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    
    const maxMentions = sorted[0]?.[1] || 1;
    
    return sorted.map(([name, mentions]) => ({
      name,
      mentions,
      maxMentions,
    }));
  }, [items]);

  // Stats
  const stats = useMemo(() => {
    const sources = new Set(items.map((i) => i.sources?.name).filter(Boolean));
    const clusters = clusterItems(items);
    return {
      articles: items.length,
      sources: sources.size,
      clusters: clusters.length,
    };
  }, [items]);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { 
    hour: "2-digit", 
    minute: "2-digit",
    hour12: false 
  });

  return (
    <div className="h-full flex flex-col bg-ast-bg">
      {/* Header - matches filter bar height */}
      <div className="h-11 px-4 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-ast-text text-sm font-semibold tracking-wide">SIGNAL</span>
          <span className="text-ast-muted text-xs">
            {stats.clusters} stories · {stats.sources} sources
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-ast-accent text-[10px]">LIVE</span>
          <span className="text-ast-muted text-xs" suppressHydrationWarning>{timeStr}</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto">
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
                  <div className="flex items-start gap-2">
                    <span className="text-ast-muted text-[10px] mt-0.5">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-ast-text text-xs font-medium leading-tight line-clamp-2">
                        {story.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-ast-gold text-[10px]">
                          [{story.sourceCount}] {story.articleCount}a
                        </span>
                        <span className="text-ast-muted text-[10px]">
                          {formatHoursAgo(story.hoursAgo)}
                        </span>
                        {story.trending === "new" && (
                          <span className="text-ast-pink text-[10px]">▲ new</span>
                        )}
                        {story.trending === "up" && (
                          <span className="text-ast-mint text-[10px]">▲ trending</span>
                        )}
                      </div>
                      {story.companies.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {story.companies.map((c) => (
                            <span 
                              key={c} 
                              className="text-[9px] px-1 py-0.5 bg-ast-border/50 text-ast-muted rounded"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Worth Reading */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
            <span className="text-ast-pink text-xs font-semibold tracking-wide">
              WORTH READING
            </span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {worthReading.length === 0 ? (
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-ast-muted text-[10px]">{item.source}</span>
                    <span className="text-ast-muted/50 text-[10px]">·</span>
                    <span className="text-ast-muted text-[10px]">{item.sourceType}</span>
                    <span className="text-ast-muted/50 text-[10px]">·</span>
                    <span className="text-ast-gold text-[10px]">{item.importanceScore.toFixed(2)}</span>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Trending Companies */}
        <div className="border-b border-ast-border">
          <div className="sticky top-0 px-4 py-2 bg-ast-bg/95 backdrop-blur-sm border-b border-ast-border/50">
            <span className="text-ast-mint text-xs font-semibold tracking-wide">
              TRENDING
            </span>
          </div>
          <div className="px-4 py-3">
            {trendingCompanies.length === 0 ? (
              <p className="text-ast-muted text-xs">No company data yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {trendingCompanies.map((company) => {
                  const barWidth = (company.mentions / company.maxMentions) * 100;
                  return (
                    <div key={company.name} className="flex items-center gap-2">
                      <span className="text-ast-text text-[10px] w-12 truncate">
                        {company.name}
                      </span>
                      <div className="flex-1 h-1.5 bg-ast-border rounded-sm overflow-hidden">
                        <div 
                          className="h-full bg-ast-mint rounded-sm" 
                          style={{ width: `${barWidth}%` }} 
                        />
                      </div>
                      <span className="text-ast-muted text-[10px] w-4 text-right">
                        {company.mentions}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats footer */}
      <div className="px-4 py-3 border-t border-ast-border bg-ast-surface">
        <div className="text-ast-muted text-xs flex items-center gap-3">
          <span>{stats.articles} articles</span>
          <span className="text-ast-border">·</span>
          <span>{stats.sources} sources</span>
          <span className="text-ast-border">·</span>
          <span>{stats.clusters} stories</span>
        </div>
      </div>
    </div>
  );
}
