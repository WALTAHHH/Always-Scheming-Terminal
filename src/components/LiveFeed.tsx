"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { FeedItem } from "@/lib/database.types";
import { Feed, matchesFilter } from "./Feed";
import type { FilterState } from "./FilterBar";
import { EMPTY_FILTERS } from "./FilterBar";
import { NewItemsBanner } from "./NewItemsBanner";
import { SignalPanel } from "./SignalPanel";
import { CompanyTray } from "./CompanyTray";
import { CompanyDrawerPortal, setGlobalItems } from "./CompanyDrawer";
import { CompanyTrayBoundary } from "./ErrorBoundary";
import { clusterItems } from "@/lib/cluster";
import { MobileSwipeView } from "./MobileSwipeView";

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
}

// Detect mobile/PWA for single-panel mode
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 640; // sm breakpoint
      const pwa = window.matchMedia('(display-mode: standalone)').matches ||
                  (window.navigator as { standalone?: boolean }).standalone === true;
      setIsMobile(mobile || pwa);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
}

export function LiveFeed({ initialItems, initialHasMore, sources }: LiveFeedProps) {
  const [items, setItems] = useState<FeedItem[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  // Filtered items — shared by Feed and SignalPanel so they stay in sync
  const filteredItems = useMemo(
    () => items.filter((item) => matchesFilter(item, filters)),
    [items, filters]
  );
  
  // Mobile/PWA detection for single-panel mode
  const isMobile = useIsMobile();
  
  // Layout state
  const [leftWidth, setLeftWidth] = useState(50);
  const [topHeight, setTopHeight] = useState(60);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);
  const leftWidthRef = useRef(50);
  const topHeightRef = useRef(60);
  const [panels, setPanels] = useState<PanelVisibility>({ feed: true, signal: true });
  
  // Company tray modal state
  const [trayOpen, setTrayOpen] = useState(false);

  useEffect(() => {
    const handler = () => setTrayOpen(true);
    window.addEventListener("ast-open-company-tray", handler);
    return () => window.removeEventListener("ast-open-company-tray", handler);
  }, []);
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
        setPanels({ feed: true, signal: true, ...parsed });
      } catch {}
    }
  }, []);

  // Enforce single-panel mode on mobile/PWA
  useEffect(() => {
    if (isMobile) {
      // On mobile, ensure only one panel is active
      setPanels((prev) => {
        const activeCount = [prev.feed, prev.signal].filter(Boolean).length;
        if (activeCount !== 1) {
          return { feed: true, signal: false };
        }
        return prev;
      });
    }
  }, [isMobile]);

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
      leftWidthRef.current = clamped;
      setLeftWidth(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingH(false);
      localStorage.setItem(STORAGE_KEY_HORIZONTAL, leftWidthRef.current.toString());
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
      topHeightRef.current = clamped;
      setTopHeight(clamped);
    };

    const handleMouseUp = () => {
      setIsDraggingV(false);
      localStorage.setItem(STORAGE_KEY_VERTICAL, topHeightRef.current.toString());
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingV, topHeight]);

  // Toggle panel visibility (single-panel mode on mobile/PWA)
  const togglePanel = useCallback((panel: keyof PanelVisibility) => {
    setPanels((prev) => {
      let next: PanelVisibility;
      
      if (isMobile) {
        // Mobile/PWA: only one panel at a time (radio button behavior)
        next = { feed: false, signal: false, [panel]: true } as PanelVisibility;
      } else {
        // Desktop: toggle individual panels
        next = { ...prev, [panel]: !prev[panel] };
      }
      
      localStorage.setItem(STORAGE_KEY_PANELS, JSON.stringify(next));
      return next;
    });
  }, [isMobile]);

  // Adjust split positions
  const adjustLeftWidth = useCallback((delta: number) => {
    setLeftWidth((prev) => {
      const next = Math.min(Math.max(prev + delta, MIN_PANE_WIDTH), MAX_PANE_WIDTH);
      localStorage.setItem(STORAGE_KEY_HORIZONTAL, next.toString());
      return next;
    });
  }, []);

  const adjustTopHeight = useCallback((delta: number) => {
    setTopHeight((prev) => {
      const next = Math.min(Math.max(prev + delta, MIN_PANE_HEIGHT), MAX_PANE_HEIGHT);
      localStorage.setItem(STORAGE_KEY_VERTICAL, next.toString());
      return next;
    });
  }, []);

  // Listen for keyboard shortcuts
  useEffect(() => {
    function handleShortcut(e: Event) {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      switch (detail.key) {
        case "toggle-feed":
          togglePanel("feed");
          break;
        case "toggle-signal":
          togglePanel("signal");
          break;
        case "toggle-companies":
          // Companies is now a modal via header icon — no panel toggle
          break;
        case "shrink-left":
          adjustLeftWidth(-5);
          break;
        case "grow-left":
          adjustLeftWidth(5);
          break;
        case "shrink-top":
          adjustTopHeight(-5);
          break;
        case "grow-top":
          adjustTopHeight(5);
          break;
      }
    }
    window.addEventListener("ast-shortcut", handleShortcut);
    return () => window.removeEventListener("ast-shortcut", handleShortcut);
  }, [togglePanel, adjustLeftWidth, adjustTopHeight]);

  // Update global items for company drawer
  useEffect(() => {
    setGlobalItems(items);
  }, [items]);

  // Seed interests filter from user preferences on mount
  useEffect(() => {
    fetch('/api/user/preferences')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.preferences?.interests?.length) {
          setFilters(prev => ({ ...prev, themes: data.preferences.interests }));
        }
      })
      .catch(() => {}); // silent fail — unauthenticated users, network errors
  }, []);

  const checkForNew = useCallback(async () => {
    try {
      // Use the newest known item's published_at as a "since" cursor.
      // Fetch up to 100 to catch bursts; compare by ID to deduplicate.
      const newest = items.length > 0 ? (items[0].published_at || items[0].ingested_at) : null;
      const params = new URLSearchParams({ limit: "100" });
      if (newest) params.set("since", newest);
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
          return new Date(bDate ?? 0).getTime() - new Date(aDate ?? 0).getTime();
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
    if (loadingMore || !hasMore || loadMoreError) return;

    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const oldest = items.reduce((min, item) => {
        const t = item.published_at || item.ingested_at;
        if (!min) return t;
        return t && t < min ? t : min;
      }, null as string | null);

      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (oldest) params.set("before", oldest);

      const res = await fetch(`/api/items?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

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
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [items, hasMore, loadingMore, loadMoreError]);

  const retryLoad = useCallback(() => {
    setLoadMoreError(false);
    loadMore();
  }, [loadMore]);

  // Calculate layout
  const showRightPane = panels.signal;
  const showBothRight = false;
  
  // If only feed is visible, it takes full width
  // If feed is hidden, right pane takes full width
  const effectiveLeftWidth = !panels.feed ? 0 : !showRightPane ? 100 : leftWidth;
  const effectiveRightWidth = !showRightPane ? 0 : !panels.feed ? 100 : (100 - leftWidth);

  // Global stats
  const stats = useMemo(() => {
    const sourceSet = new Set(items.map((i) => i.sources?.name).filter(Boolean));
    const clusters = clusterItems(items);
    return {
      articles: items.length,
      sources: sourceSet.size,
      stories: clusters.length,
    };
  }, [items]);

  // Mobile panels config for swipe view
  const mobilePanels = useMemo(() => [
    {
      id: "feed",
      label: "Feed",
      color: "ast-accent",
      content: (
        <Feed
          items={items}
          sources={sources}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={loadMore}
          onRetry={retryLoad}
          filters={filters}
          onFiltersChange={setFilters}
        />
      ),
    },
    {
      id: "signal",
      label: "Signal",
      color: "ast-gold",
        content: <SignalPanel items={items} />,
    },
    {
      id: "companies",
      label: "Companies",
      color: "ast-mint",
      content: (
        <CompanyTray
          items={items}
        />
      ),
    },
  ], [items, sources, hasMore, loadingMore, loadMore]);

  // Mobile view
  if (isMobile) {
    return (
      <>
        <NewItemsBanner count={newCount} onClick={loadNewItems} />
        <div className="h-[calc(100vh-6rem)]">
          <MobileSwipeView panels={mobilePanels} initialIndex={1} />
        </div>
        <CompanyDrawerPortal />
      </>
    );
  }

  // Desktop view
  return (
    <>
      <NewItemsBanner count={newCount} onClick={loadNewItems} />

      <div 
        ref={containerRef}
        className={`flex h-[calc(100vh-6.5rem)] sm:h-[calc(100vh-7rem)] ${isDraggingH || isDraggingV ? "select-none" : ""}`}
      >
        {/* Left pane: Feed */}
        {panels.feed && (
          <>
            <div 
              className="overflow-y-auto"
              style={{ width: isMobile ? "100%" : `${effectiveLeftWidth}%` }}
            >
              <Feed
                items={items}
                sources={sources}
                hasMore={hasMore}
                loadingMore={loadingMore}
                loadMoreError={loadMoreError}
                onLoadMore={loadMore}
                onRetry={retryLoad}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
            
            {/* Horizontal divider (desktop only) */}
            {showRightPane && !isMobile && (
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
            style={{ width: isMobile ? "100%" : `${effectiveRightWidth}%` }}
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
                
                {/* Vertical divider (desktop only) */}
                {showBothRight && !isMobile && (
                  <div
                    onMouseDown={handleMouseDownV}
                    className={`h-1 flex-shrink-0 cursor-row-resize border-y border-ast-border hover:bg-ast-mint/30 transition-colors ${
                      isDraggingV ? "bg-ast-mint/50" : "bg-ast-surface"
                    }`}
                  />
                )}
              </>
            )}
            
            {/* Companies panel removed — now accessible via header Markets icon as modal */}
          </div>
        )}
      </div>
      
      {/* Global stats footer */}
      <div className="h-8 px-4 border-t border-ast-border bg-ast-surface flex items-center justify-center">
        <div className="text-ast-muted text-xs flex items-center gap-3">
          <span>{stats.articles} articles</span>
          <span className="text-ast-border">·</span>
          <span>{stats.sources} sources</span>
          <span className="text-ast-border">·</span>
          <span>{stats.stories} stories</span>
        </div>
      </div>
      
      <CompanyDrawerPortal />

      {/* CompanyTray modal — triggered by header Markets icon */}
      {trayOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setTrayOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative z-10 w-[90vw] max-w-5xl max-h-[85vh] overflow-y-auto rounded-lg border border-ast-border bg-ast-bg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between px-4 py-2 border-b border-ast-border bg-ast-bg/95 backdrop-blur-sm">
              <span className="text-xs font-semibold tracking-wider text-ast-muted uppercase">Markets</span>
              <button
                onClick={() => setTrayOpen(false)}
                className="text-ast-muted hover:text-ast-text transition-colors text-lg leading-none"
              >
                ×
              </button>
            </div>
            <CompanyTrayBoundary>
              <CompanyTray items={items} />
            </CompanyTrayBoundary>
          </div>
        </div>
      )}
    </>
  );
}
