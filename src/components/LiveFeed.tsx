"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FeedItem } from "@/lib/database.types";
import { Feed } from "./Feed";
import { NewItemsBanner } from "./NewItemsBanner";

interface LiveFeedProps {
  initialItems: FeedItem[];
  sources: { name: string }[];
}

const POLL_INTERVAL = 60_000; // Check for new items every 60s

export function LiveFeed({ initialItems, sources }: LiveFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [newCount, setNewCount] = useState(0);
  const pendingItems = useRef<FeedItem[]>([]);
  const latestId = useRef<string | null>(
    initialItems.length > 0 ? initialItems[0].id : null
  );
  const latestPublished = useRef<string | null>(
    initialItems.length > 0 ? initialItems[0].published_at : null
  );

  const checkForNew = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      const fetched: FeedItem[] = data.items || [];

      if (fetched.length === 0) return;

      // Find items newer than what we currently have
      const existingIds = new Set(items.map((i) => i.id));
      const newItems = fetched.filter((i) => !existingIds.has(i.id));

      if (newItems.length > 0) {
        pendingItems.current = newItems;
        setNewCount(newItems.length);
      }
    } catch {
      // Silently fail — no need to bother the user
    }
  }, [items]);

  // Poll for new items
  useEffect(() => {
    const interval = setInterval(checkForNew, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForNew]);

  // Load pending items into the feed
  const loadNewItems = useCallback(() => {
    if (pendingItems.current.length > 0) {
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const deduped = pendingItems.current.filter(
          (i) => !existingIds.has(i.id)
        );
        const merged = [...deduped, ...prev].sort((a, b) => {
          const aDate = a.published_at || a.ingested_at;
          const bDate = b.published_at || b.ingested_at;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
        return merged;
      });

      if (pendingItems.current.length > 0) {
        latestId.current = pendingItems.current[0].id;
        latestPublished.current = pendingItems.current[0].published_at;
      }

      pendingItems.current = [];
      setNewCount(0);

      // Scroll to top
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  return (
    <>
      <NewItemsBanner count={newCount} onClick={loadNewItems} />
      <Feed items={items} sources={sources} />
    </>
  );
}
