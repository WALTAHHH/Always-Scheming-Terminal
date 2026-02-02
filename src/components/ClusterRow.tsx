"use client";

import { useState } from "react";
import type { StoryCluster } from "@/lib/cluster";
import { FeedRow } from "./FeedRow";
import { getImportanceTier, TIER_STYLES } from "@/lib/importance";

interface ClusterRowProps {
  cluster: StoryCluster;
}

export function ClusterRow({ cluster }: ClusterRowProps) {
  const [expanded, setExpanded] = useState(false);
  const tier = getImportanceTier(cluster.importanceScore ?? 0);
  const tierStyle = TIER_STYLES[tier];

  const scorePercent = ((cluster.importanceScore ?? 0) * 100).toFixed(0);
  const importanceBadge = tier !== "low" ? (
    <div className="absolute top-3 right-3 flex items-center gap-1.5 group/tip cursor-default">
      <span className={`w-1.5 h-1.5 rounded-full ${tierStyle.dotColor}`} />
      {tierStyle.label && (
        <span className={`text-[9px] font-semibold tracking-wider ${tierStyle.color}`}>
          {tierStyle.label}
        </span>
      )}
      {/* Tooltip */}
      <div className="absolute right-0 top-full mt-1 hidden group-hover/tip:block z-50">
        <div className={`px-2.5 py-1.5 rounded text-[10px] whitespace-nowrap border border-ast-border bg-ast-surface shadow-lg ${tierStyle.color}`}>
          {tierStyle.tooltip} <span className="text-ast-muted">({scorePercent})</span>
        </div>
      </div>
    </div>
  ) : null;

  // Single item — render with importance indicator if noteworthy
  if (cluster.related.length === 0) {
    return (
      <div className="relative">
        <FeedRow item={cluster.lead} />
        {importanceBadge}
      </div>
    );
  }

  return (
    <div className={`${cluster.isMultiSource ? "border-l-2 border-l-ast-gold" : ""}`}>
      {/* Lead article */}
      <div className="relative">
        <FeedRow item={cluster.lead} />
        {importanceBadge}

        {/* Cluster indicator bar */}
        <div className="px-3 pb-2 flex items-center gap-2">
          <button
            onClick={(e) => {
              e.preventDefault();
              setExpanded(!expanded);
            }}
            className="flex items-center gap-2 text-[10px] text-ast-muted hover:text-ast-accent transition-colors"
          >
            {cluster.isMultiSource && (
              <span className="px-1.5 py-0.5 bg-ast-gold/10 text-ast-gold rounded text-[10px] font-semibold">
                {cluster.sourceCount} sources
              </span>
            )}
            <span>
              {expanded ? "▾" : "▸"} {cluster.related.length} related{" "}
              {cluster.related.length === 1 ? "article" : "articles"}
            </span>
            {!expanded && (
              <span className="text-ast-muted/60">
                — {cluster.sourceNames.filter((s) => s !== cluster.lead.sources?.name).join(", ")}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Expanded related articles */}
      {expanded && (
        <div className="ml-3 sm:ml-6 border-l border-ast-border/50">
          {cluster.related.map((item) => (
            <div key={item.id} className="opacity-80">
              <FeedRow item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
