"use client";

import { useState } from "react";
import type { StoryCluster } from "@/lib/cluster";
import { FeedRow } from "./FeedRow";

interface ClusterRowProps {
  cluster: StoryCluster;
}

export function ClusterRow({ cluster }: ClusterRowProps) {
  const [expanded, setExpanded] = useState(false);

  // Single item — just render normally
  if (cluster.related.length === 0) {
    return <FeedRow item={cluster.lead} />;
  }

  return (
    <div className={`${cluster.isMultiSource ? "border-l-2 border-l-[#f2cb05]" : ""}`}>
      {/* Lead article */}
      <div className="relative">
        <FeedRow item={cluster.lead} />

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
              <span className="px-1.5 py-0.5 bg-[#f2cb05]/10 text-[#f2cb05] rounded text-[10px] font-semibold">
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
        <div className="ml-6 border-l border-ast-border/50">
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
