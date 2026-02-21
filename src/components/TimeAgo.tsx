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
 * Uses suppressHydrationWarning to avoid SSR/client mismatch errors.
 */
export function TimeAgo({ date, className }: { date: string | null; className?: string }) {
  const [text, setText] = useState<string>("--:--");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setText(formatTimeAgo(date));

    const interval = setInterval(() => {
      setText(formatTimeAgo(date));
    }, 60_000);

    return () => clearInterval(interval);
  }, [date]);

  // Render placeholder until mounted to avoid hydration mismatch
  if (!mounted) {
    return <span className={className} suppressHydrationWarning>--:--</span>;
  }

  return <span className={className}>{text}</span>;
}
