"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FeedItem } from "@/lib/database.types";
import { Feed } from "./Feed";
import { NewItemsBanner } from "./NewItemsBanner";
import { SignalPanel } from "./SignalPanel";
import { CompanyTray } from "./CompanyTray";
import { CompanyDrawerPortal, setGlobalItems } from "./CompanyDrawer";

interface LiveFeedProps {
  initialItems: FeedItem[];
  initialHasMore: boolean;
  sources: { name: string }[];
}

const POLL_INTERVAL = 60_000;
const PAGE_SIZE = 50;
const MIN_PANE_WIDTH = 20;
const MAX_PANE_WIDTH = 80;
const MIN_PANE_HEIGHT = 15;
const MAX_PANE_HEIGHT = 85;
const STORAGE_KEY_HORIZONTAL = "ast-split-horizontal";
const STORAGE_KEY_VERTICAL = "ast-split-vertical";
const STORAGE_KEY_PANELS = "ast-panel-visibility";

interface PanelVisibility {
  feed: boolean;
  signal: boolean;
  companies: boolean;
}

export function LiveFeed({ initialItems, initialHasMore, sources }: LiveFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newCount, setNewCount] = useState(0);
  
  // Layout state
  const [leftWidth, setLeftWidth] = useState(50);
  const [topHeight, setTopHeight] = useState(60);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);
  const [panels, setPanels] = useState<PanelVisibility>({ feed: true, signal: true, companies: true });
  
  // Company tray state
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);
  const pendingItems = useRef<FeedItem[]>([]);
  const latestId = useRef<string | null>(
    initialItems.length > 0 ? initialItems[0].id : null
  );

  // Load saved layout
  useEffect(() => {
    const savedH = localStorage.getItem(STORAGE_KEY_HORIZONTAL);
    if (savedH) {
      const parsed = parseFloat(savedH);
      if (!isNaN(parsed) && parsed >= MIN_PANE_WIDTH && parsed <= MAX_PANE_WIDTH) {
        setLeftWidth(parsed);
      }
    }
    
    const savedV = localStorage.getItem(STORAGE_KEY_VERTICAL);
    if (savedV) {
      const parsed = parseFloat(savedV);
      if (!isNaN(parsed) && parsed >= MIN_PANE_HEIGHT && parsed <= MAX_PANE_HEIGHT) {
        setTopHeight(parsed);
      }
    }

    const savedPanels = localStorage.getItem(STORAGE_KEY_PANELS);
    if (savedPanels) {
      try {
        const parsed = JSON.parse(savedPanels);
        setPanels({ feed: true, signal: true, companies: true, ...parsed });
      } catch {}
    }
  }, []);

  // Horizontal drag (left/right split)
  const handleMouseDownH = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingH(true);
  }, []);

  useEffect(() => {
    if (!isDraggingH) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = (x / rect.width) * 100;
      const clamped = Math.min(Math.max(percentage, MIN_PANE_WIDTH), MAX_PANE_WIDTH);
      setLeftWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingH(false);
      localStorage.setItem(STORAGE_KEY_HORIZONTAL, leftWidth.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingH, leftWidth]);

  // Vertical drag (top/bottom split in right pane)
  const handleMouseDownV = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingV(true);
  }, []);

  useEffect(() => {
    if (!isDraggingV) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!rightPaneRef.current) return;
      const rect = rightPaneRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const percentage = (y / rect.height) * 100;
      const clamped = Math.min(Math.max(percentage, MIN_PANE_HEIGHT), MAX_PANE_HEIGHT);
      setTopHeight(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingV(false);
      localStorage.setItem(STORAGE_KEY_VERTICAL, topHeight.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingV, topHeight]);

  // Toggle panel visibility
  const togglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanels((prev) => {
      const next = { ...prev, [panel]: !prev[panel] };
      localStorage.setItem(STORAGE_KEY_PANELS, JSON.stringify(next));
      return next;
    });
  }, []);

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

      const existingIds = new Set(items.map((i) => i.id));
      const newItems = fetched.filter((i) => !existingIds.has(i.id));

      if (newItems.length > 0) {
        pendingItems.current = newItems;
        setNewCount(newItems.length);
      }
    } catch {}
  }, [items]);

  useEffect(() => {
    const interval = setInterval(checkForNew, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [checkForNew]);

  const loadNewItems = useCallback(() => {
    if (pendingItems.current.length > 0) {
      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const deduped = pendingItems.current.filter((i) => !existingIds.has(i.id));
        const merged = [...deduped, ...prev].sort((a, b) => {
          const aDate = a.published_at || a.ingested_at;
          const bDate = b.published_at || b.ingested_at;
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        });
        return merged;
      });

      if (pendingItems.current.length > 0) {
        latestId.current = pendingItems.current[0].id;
      }

      pendingItems.current = [];
      setNewCount(0);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const oldest = items.reduce((min, item) => {
        const t = item.published_at || item.ingested_at;
        if (!min) return t;
        return t && t < min ? t : min;
      }, null as string | null);

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (oldest) params.set("before", oldest);

      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) return;

      const data = await res.json();
      const fetched: FeedItem[] = data.items || [];

      if (fetched.length === 0) {
        setHasMore(false);
        return;
      }

      setItems((prev) => {
        const existingIds = new Set(prev.map((i) => i.id));
        const newOnes = fetched.filter((i) => !existingIds.has(i.id));
        return [...prev, ...newOnes];
      });

      setHasMore(data.hasMore ?? fetched.length === PAGE_SIZE);
    } catch {}
    finally {
      setLoadingMore(false);
    }
  }, [items, hasMore, loadingMore]);

  // Calculate layout
  const showRightPane = panels.signal || panels.companies;
  const showBothRight = panels.signal && panels.companies;
  
  // If only feed is visible, it takes full width
  // If feed is hidden, right pane takes full width
  const effectiveLeftWidth = !panels.feed ? 0 : !showRightPane ? 100 : leftWidth;
  const effectiveRightWidth = !showRightPane ? 0 : !panels.feed ? 100 : (100 - leftWidth);

  return (
    <>
      <NewItemsBanner count={newCount} onClick={loadNewItems} />
      
      {/* Panel toggle bar */}
      <div className="h-8 px-4 border-b border-ast-border bg-ast-surface/50 flex items-center gap-4">
        <span className="text-[10px] text-ast-muted uppercase tracking-wide">Panels:</span>
        <button
          onClick={() => togglePanel("feed")}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            panels.feed 
              ? "border-ast-accent text-ast-accent bg-ast-accent/10" 
              : "border-ast-border text-ast-muted hover:text-ast-text"
          }`}
        >
          Feed
        </button>
        <button
          onClick={() => togglePanel("signal")}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            panels.signal 
              ? "border-ast-gold text-ast-gold bg-ast-gold/10" 
              : "border-ast-border text-ast-muted hover:text-ast-text"
          }`}
        >
          Signal
        </button>
        <button
          onClick={() => togglePanel("companies")}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            panels.companies 
              ? "border-ast-mint text-ast-mint bg-ast-mint/10" 
              : "border-ast-border text-ast-muted hover:text-ast-text"
          }`}
        >
          Companies
        </button>
      </div>

      <div 
        ref={containerRef}
        className={`flex h-[calc(100vh-5.5rem)] sm:h-[calc(100vh-6rem)] ${isDraggingH || isDraggingV ? "select-none" : ""}`}
      >
        {/* Left pane: Feed */}
        {panels.feed && (
          <>
            <div 
              className="overflow-y-auto"
              style={{ width: `${effectiveLeftWidth}%` }}
            >
              <Feed
                items={items}
                sources={sources}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onLoadMore={loadMore}
              />
            </div>
            
            {/* Horizontal divider */}
            {showRightPane && (
              <div
                onMouseDown={handleMouseDownH}
                className={`w-1 flex-shrink-0 cursor-col-resize border-x border-ast-border hover:bg-ast-accent/30 transition-colors ${
                  isDraggingH ? "bg-ast-accent/50" : "bg-ast-surface"
                }`}
              />
            )}
          </>
        )}
        
        {/* Right pane: Signal + Companies */}
        {showRightPane && (
          <div 
            ref={rightPaneRef}
            className="flex flex-col"
            style={{ width: `${effectiveRightWidth}%` }}
          >
            {/* Top: Signal */}
            {panels.signal && (
              <>
                <div 
                  className="overflow-y-auto"
                  style={{ height: showBothRight ? `${topHeight}%` : "100%" }}
                >
                  <SignalPanel items={items} />
                </div>
                
                {/* Vertical divider */}
                {showBothRight && (
                  <div
                    onMouseDown={handleMouseDownV}
                    className={`h-1 flex-shrink-0 cursor-row-resize border-y border-ast-border hover:bg-ast-mint/30 transition-colors ${
                      isDraggingV ? "bg-ast-mint/50" : "bg-ast-surface"
                    }`}
                  />
                )}
              </>
            )}
            
            {/* Bottom: Companies */}
            {panels.companies && (
              <div 
                className="overflow-hidden"
                style={{ height: showBothRight ? `${100 - topHeight}%` : "100%" }}
              >
                <CompanyTray 
                  items={items} 
                  selectedCompany={selectedCompany}
                  onSelectCompany={setSelectedCompany}
                />
              </div>
            )}
          </div>
        )}
      </div>
      
      <CompanyDrawerPortal />
    </>
  );
}
