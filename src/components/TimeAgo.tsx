"use client";

import { useState, useEffect } from "react";

function formatTimeAgo(dateStr: string | null, relativeOnly: boolean): string {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays <= 6) return `${diffDays}d`;

  // Older than 6 days.
  if (relativeOnly) {
    // Keep relative framing for old timestamps too (weeks / months / years).
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);
    if (diffMonths < 1) return `${diffWeeks}w`;
    if (diffYears < 1) return `${diffMonths}mo`;
    return `${diffYears}y`;
  }

  // Default: abbreviated absolute date for older items (feed behaviour).
  const nowDate = new Date();
  const showYear = d.getFullYear() !== nowDate.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: showYear ? "numeric" : undefined,
  });
}

/** Full absolute timestamp for the native hover tooltip. */
function formatAbsolute(dateStr: string | null): string | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Self-updating relative timestamp.
 * Re-renders every 60s to keep "3m", "2h" etc. fresh.
 * Uses suppressHydrationWarning to avoid SSR/client mismatch errors.
 *
 * - relativeOnly: keep a relative label (weeks/months/years) even for old
 *   timestamps instead of falling back to an absolute date. Use this where
 *   relative context matters more than the exact day (e.g. signal rows).
 * - The exact timestamp is always available on hover via the `title` attribute.
 */
export function TimeAgo({
  date,
  className,
  relativeOnly = false,
}: {
  date: string | null;
  className?: string;
  relativeOnly?: boolean;
}) {
  const [text, setText] = useState<string>("--:--");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setText(formatTimeAgo(date, relativeOnly));

    const interval = setInterval(() => {
      setText(formatTimeAgo(date, relativeOnly));
    }, 60_000);

    return () => clearInterval(interval);
  }, [date, relativeOnly]);

  const absolute = formatAbsolute(date);

  // Render placeholder until mounted to avoid hydration mismatch
  if (!mounted) {
    return (
      <span className={className} title={absolute} suppressHydrationWarning>
        --:--
      </span>
    );
  }

  return (
    <span className={className} title={absolute}>
      {text}
    </span>
  );
}
