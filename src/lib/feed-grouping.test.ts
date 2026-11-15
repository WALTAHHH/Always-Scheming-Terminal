import { describe, it, expect } from "vitest";
import { formatDateGroupLabel, groupByDate } from "./feed-grouping";
import type { StoryCluster } from "./cluster";

// Fixed "now" so the labels are deterministic: Thursday, Oct 15 2026.
const NOW = new Date(2026, 9, 15, 12, 0, 0);

function clusterAt(id: string, published_at: string | null): StoryCluster {
  return {
    id,
    lead: { id, title: id, published_at } as any,
    related: [],
    sourceCount: 1,
    sourceNames: [],
    isMultiSource: false,
  };
}

describe("formatDateGroupLabel()", () => {
  it("uses relative labels for today and yesterday", () => {
    expect(formatDateGroupLabel(new Date(2026, 9, 15, 8, 0, 0), NOW)).toBe("Today");
    expect(formatDateGroupLabel(new Date(2026, 9, 14, 23, 0, 0), NOW)).toBe("Yesterday");
  });

  it("uses the weekday name for the rest of the last 7 days", () => {
    expect(formatDateGroupLabel(new Date(2026, 9, 12), NOW)).toBe("Monday");
    expect(formatDateGroupLabel(new Date(2026, 9, 9), NOW)).toBe("Friday");
  });

  it("switches to 'Mon D' once a date is a week old", () => {
    expect(formatDateGroupLabel(new Date(2026, 9, 8), NOW)).toBe("Oct 8");
    expect(formatDateGroupLabel(new Date(2026, 0, 5), NOW)).toBe("Jan 5");
  });

  it("appends the year for dates from a previous year", () => {
    expect(formatDateGroupLabel(new Date(2025, 11, 31), NOW)).toBe("Dec 31, 2025");
  });

  it("falls back to 'Unknown Date' for missing or invalid input", () => {
    expect(formatDateGroupLabel(null, NOW)).toBe("Unknown Date");
    expect(formatDateGroupLabel(undefined, NOW)).toBe("Unknown Date");
    expect(formatDateGroupLabel(new Date("not-a-date"), NOW)).toBe("Unknown Date");
  });

  it("never mixes a weekday with a month/day for the same date", () => {
    // Regression guard for #113: older labels must not carry a weekday prefix.
    const label = formatDateGroupLabel(new Date(2026, 9, 8), NOW);
    expect(label).not.toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
  });
});

describe("groupByDate()", () => {
  it("groups clusters under one consistent label per day", () => {
    const clusters = [
      clusterAt("a", new Date(2026, 9, 15).toISOString()),
      clusterAt("b", new Date(2026, 9, 15, 6).toISOString()),
      clusterAt("c", new Date(2026, 9, 14).toISOString()),
      clusterAt("d", new Date(2026, 9, 12).toISOString()),
      clusterAt("e", new Date(2026, 9, 8).toISOString()),
      clusterAt("f", null),
    ];

    const groups = groupByDate(clusters, NOW);

    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Monday",
      "Oct 8",
      "Unknown Date",
    ]);
    expect(groups[0].clusters.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("keeps input order of groups and clusters", () => {
    const clusters = [
      clusterAt("new", new Date(2026, 9, 15).toISOString()),
      clusterAt("old", new Date(2026, 9, 8).toISOString()),
    ];
    const groups = groupByDate(clusters, NOW);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Oct 8"]);
  });

  it("returns an empty array for no clusters", () => {
    expect(groupByDate([], NOW)).toEqual([]);
  });
});
