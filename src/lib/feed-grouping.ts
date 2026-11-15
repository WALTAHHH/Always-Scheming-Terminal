import type { StoryCluster } from "./cluster";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Normalize a Date to midnight in local time (drops the time-of-day). */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Produce the date-group label for a single published date.
 *
 * One consistent scheme (issue #113), from most recent to oldest:
 *   - "Today" / "Yesterday"          — relative for the last two days
 *   - weekday name ("Wednesday")     — the rest of the last 7 days
 *   - "Mon D" ("Oct 10")             — earlier this year
 *   - "Mon D, YYYY" ("Oct 10, 2025") — previous years
 *   - "Unknown Date"                 — missing/invalid timestamp
 *
 * `now` is injectable so the result is deterministic in tests.
 */
export function formatDateGroupLabel(
  pubDate: Date | null | undefined,
  now: Date = new Date()
): string {
  if (!pubDate || Number.isNaN(pubDate.getTime())) {
    return "Unknown Date";
  }

  const today = startOfDay(now);
  const itemDay = startOfDay(pubDate);
  const diffDays = Math.round(
    (today.getTime() - itemDay.getTime()) / MS_PER_DAY
  );

  // Same day (or a future timestamp, which we treat as "today").
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return WEEKDAYS[pubDate.getDay()];

  const monthDay = `${MONTHS_SHORT[pubDate.getMonth()]} ${pubDate.getDate()}`;
  return pubDate.getFullYear() === now.getFullYear()
    ? monthDay
    : `${monthDay}, ${pubDate.getFullYear()}`;
}

/**
 * Group clusters by a single, consistent date label (issue #113).
 * Preserves the input order of both the date groups and the clusters
 * within each group.
 */
export function groupByDate(
  clusters: StoryCluster[],
  now: Date = new Date()
): { label: string; clusters: StoryCluster[] }[] {
  const groups: Map<string, StoryCluster[]> = new Map();

  for (const cluster of clusters) {
    const pubDate = cluster.lead.published_at
      ? new Date(cluster.lead.published_at)
      : null;
    const label = formatDateGroupLabel(pubDate, now);

    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(cluster);
  }

  return Array.from(groups.entries()).map(([label, groupClusters]) => ({
    label,
    clusters: groupClusters,
  }));
}
