"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FeedItem } from "@/lib/database.types";
import { Feed } from "./Feed";
import { NewItemsBanner } from "./NewItemsBanner";
import { SignalPanel } from "./SignalPanel";
import { CompanyDrawerPortal, setGlobalItems } from "./CompanyDrawer";

interface LiveFeedProps {
  initialItems: FeedItem[];
  initialHasMore: boolean;
  sources: { name: string }[];
}

const POLL_INTERVAL = 60_000; // Check for new items every 60s
const PAGE_SIZE = 50;
const MIN_PANE_WIDTH = 20; // minimum percentage
const MAX_PANE_WIDTH = 80; // maximum percentage
const STORAGE_KEY = "ast-split-position";

export function LiveFeed({ initialItems, initialHasMore, sources }: LiveFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [leftWidth, setLeftWidth] = useState(50); // percentage
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingItems = useRef<FeedItem[]>([]);
  const latestId = useRef<string | null>(
    initialItems.length > 0 ? initialItems[0].id : null
  );
  const latestPublished = useRef<string | null>(
    initialItems.length > 0 ? initialItems[0].published_at : null
  );

  // Load saved split position
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_PANE_WIDTH && parsed <= MAX_PANE_WIDTH) {
        setLeftWidth(parsed);
      }
    }
  }, []);

  // Handle drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      const clamped = Math.min(Math.max(percentage, MIN_PANE_WIDTH), MAX_PANE_WIDTH);
      setLeftWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      localStorage.setItem(STORAGE_KEY, leftWidth.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, leftWidth]);

  // Update global items for company drawer
  useEffect(() => {
    setGlobalItems(items);
  }, [items]);

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

  // Load older items (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      // Find the oldest published_at in current items for cursor
      const oldest = items.reduce((min, item) => {
        const t = item.published_at || item.ingested_at;
        if (!min) return t;
        return t && t < min ? t : min;
      }, null as string | null);

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (oldest) {
        params.set("before", oldest);
      }

      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      const fetched: FeedItem[] = data.items || [];

      if (fetched.length === 0) {
        setHasMore(false);
        return;
      }

      // Deduplicate and append
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newOnes = fetched.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newOnes];
      });

      setHasMore(data.hasMore ?? fetched.length === PAGE_SIZE);
    } catch {
      // Silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [items, hasMore, loadingMore]);

  return (
    <>
      <NewItemsBanner count={newCount} onClick={loadNewItems} />
      <div 
        ref={containerRef}
        className={`flex h-[calc(100vh-3rem)] sm:h-[calc(100vh-3.5rem)] ${isDragging ? "select-none" : ""}`}
      >
        {/* Left pane: Feed */}
        <div 
          className="overflow-y-auto"
          style={{ width: `${leftWidth}%` }}
        >
          <Feed
            items={items}
            sources={sources}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        </div>
        
        {/* Draggable divider */}
        <div
          onMouseDown={handleMouseDown}
          className={`w-1 flex-shrink-0 cursor-col-resize border-x border-ast-border hover:bg-ast-accent/30 transition-colors ${
            isDragging ? "bg-ast-accent/50" : "bg-ast-surface"
          }`}
        />
        
        {/* Right pane: Signal Dashboard */}
        <div 
          className="overflow-y-auto"
          style={{ width: `${100 - leftWidth}%` }}
        >
          <SignalPanel items={items} />
        </div>
      </div>
      
      {/* Company Drawer Portal */}
      <CompanyDrawerPortal />
    </>
  );
}
