"use client";

import { useState, useEffect } from "react";

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Self-updating relative timestamp.
 * Re-renders every 60s to keep "3m", "2h" etc. fresh.
 */
export function TimeAgo({ date, className }: { date: string | null; className?: string }) {
  const [text, setText] = useState(() => formatTimeAgo(date));

  useEffect(() => {
    // Update immediately in case SSR value is stale
    setText(formatTimeAgo(date));

    const interval = setInterval(() => {
      setText(formatTimeAgo(date));
    }, 60_000);

    return () => clearInterval(interval);
  }, [date]);

  return <span className={className}>{text}</span>;
}
