"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { TickerBar } from "./TickerBar";
import { useTheme } from "./ThemeProvider";
import { createAuthBrowserClient } from "@/lib/supabase";

/** Minimal shape of an alert row from GET /api/v1/alerts (spec §3.5, §5.3). */
interface AlertSignal {
  summary?: string | null;
  signal_type?: string | null;
  content?:
    | { title?: string | null; url?: string | null }
    | { title?: string | null; url?: string | null }[]
    | null;
}

interface AlertEntity {
  canonical_name?: string | null;
  ticker?: string | null;
}

interface AlertRow {
  id: string;
  created_at?: string | null;
  read_at?: string | null;
  signal?: AlertSignal | AlertSignal[] | null;
  entity?: AlertEntity | AlertEntity[] | null;
}

/** Supabase embeds can come back as an object or a one-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function describeAlert(alert: AlertRow): { summary: string; url: string | null; entity: string | null } {
  const signal = firstOf(alert.signal);
  const content = firstOf(signal?.content);
  const entity = firstOf(alert.entity);
  const entityLabel = entity?.canonical_name
    ? entity.ticker
      ? `${entity.canonical_name} (${entity.ticker})`
      : entity.canonical_name
    : null;
  return {
    summary: signal?.summary || content?.title || "New signal alert",
    url: content?.url ?? null,
    entity: entityLabel,
  };
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Don't render until mounted to avoid hydration mismatch
  if (!mounted) {
    return <div className="w-14 h-7" />; // Placeholder for layout stability
  }
  
  const isDark = theme === "dark";
  
  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center w-14 h-7 rounded-full p-1 transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-ast-accent/50"
      style={{ 
        backgroundColor: isDark ? "var(--ast-surface)" : "#e2e8f0",
        border: `1px solid ${isDark ? "var(--ast-border)" : "#cbd5e1"}`,
      }}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      {/* Track icons */}
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2">
        <svg className={`w-3.5 h-3.5 transition-opacity ${isDark ? "opacity-100 text-ast-gold" : "opacity-30 text-gray-400"}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <svg className={`w-3.5 h-3.5 transition-opacity ${!isDark ? "opacity-100 text-amber-500" : "opacity-30 text-gray-500"}`} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
      </span>
      
      {/* Sliding knob */}
      <span 
        className={`absolute w-5 h-5 rounded-full shadow-md transition-all duration-300 ${
          isDark 
            ? "left-1 bg-ast-accent" 
            : "left-[calc(100%-1.5rem)] bg-white"
        }`}
      />
    </button>
  );
}

export function Header() {
  const router = useRouter();
  const supabase = createAuthBrowserClient();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unread, setUnread] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUserEmail(session?.user?.email || null);

      if (session) {
        try {
          const prefsRes = await fetch('/api/user/preferences');
          if (prefsRes.ok) {
            const data = await prefsRes.json();
            setIsAdmin(data.profile?.role === 'admin');
            setDisplayName(data.profile?.display_name || null);
          }
        } catch {}
      }
    };
    getUser();
  }, [supabase]);

  // Unread badge count — GET /api/v1/alerts?unread=1 returns { unread: n }.
  useEffect(() => {
    if (!userEmail) {
      setUnread(0);
      return;
    }
    let cancelled = false;
    fetch("/api/v1/alerts?unread=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.unread === "number") setUnread(data.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userEmail]);

  const toggleAlerts = async () => {
    if (alertsOpen) {
      setAlertsOpen(false);
      return;
    }
    setAlertsOpen(true);
    setAlertsLoading(true);
    try {
      const res = await fetch("/api/v1/alerts?unread_only=1&limit=20", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
        if (typeof data?.unread === "number") setUnread(data.unread);
      }
    } catch {}
    setAlertsLoading(false);
  };

  const markAlertsRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/v1/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => !ids.includes(a.id)));
        setUnread((n) => Math.max(0, n - ids.length));
      }
    } catch {}
  };

  const markAllAlertsRead = async () => {
    try {
      const res = await fetch("/api/v1/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (res.ok) {
        setAlerts([]);
        setUnread(0);
      }
    } catch {}
  };

  const openAlert = (alert: AlertRow) => {
    const { url } = describeAlert(alert);
    void markAlertsRead([alert.id]);
    setAlertsOpen(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const getInitials = (text: string) => {
    return text.substring(0, 2).toUpperCase();
  };

  const getAvatarInitials = () => {
    if (displayName) {
      return displayName.substring(0, 2).toUpperCase();
    }
    if (userEmail) {
      return getInitials(userEmail);
    }
    return "??";
  };

  return (
    <header className="border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
      <div className="flex flex-col">
        {/* Top row */}
        <div className="h-12 sm:h-14 px-3 sm:px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Always Scheming"
              width={24}
              height={24}
              className="w-5 h-5 sm:w-6 sm:h-6"
            />
            <h1 className="font-semibold text-sm sm:text-lg tracking-tight">
              <span className="text-ast-text hidden sm:inline">
                <span className="text-ast-accent">Always</span>{" "}
                <span className="text-ast-pink">Scheming</span>{" "}
              </span>
              <span className="text-ast-text">Terminal</span>
            </h1>
            <span className="text-ast-muted text-[10px] sm:text-xs">v0.1</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            
            <a
              href="/api/feed.xml"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ast-muted hover:text-orange-400 text-xs transition-colors flex items-center gap-1"
              title="RSS Feed"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="6.18" cy="17.82" r="2.18"/>
                <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56zm0 5.66v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9z"/>
              </svg>
              <span className="hidden sm:inline">RSS</span>
            </a>
            <a
              href="/api-explorer"
              className="text-ast-muted hover:text-ast-accent text-xs transition-colors flex items-center gap-1"
              title="API Explorer"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" />
                <polyline points="8 6 2 12 8 18" />
              </svg>
              <span className="hidden sm:inline">API</span>
            </a>
            <ThemeToggle />
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('ast-open-company-tray'))}
              className="text-ast-muted hover:text-ast-mint text-xs transition-colors flex items-center gap-1"
              title="Companies & Markets"
              aria-label="Open companies tray"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 6v14h18V6H3zm16 12H5V8h14v10zM7 10h2v6H7v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6z"/>
              </svg>
              <span className="hidden sm:inline">Markets</span>
            </button>
            {userEmail && (
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleAlerts}
                  className="relative text-ast-muted hover:text-ast-accent text-xs transition-colors flex items-center"
                  title={unread > 0 ? `${unread} unread alert${unread === 1 ? "" : "s"}` : "Alerts"}
                  aria-label={unread > 0 ? `Alerts, ${unread} unread` : "Alerts"}
                  aria-expanded={alertsOpen}
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {unread > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-ast-pink text-white text-[9px] font-bold leading-[14px] text-center">
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                </button>
                {alertsOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setAlertsOpen(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] rounded border border-ast-border bg-ast-surface shadow-lg z-50 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 border-b border-ast-border">
                        <span className="text-xs font-semibold text-ast-text">Alerts</span>
                        <div className="flex items-center gap-2">
                          {alerts.length > 0 && (
                            <button
                              type="button"
                              onClick={markAllAlertsRead}
                              className="text-[10px] text-ast-muted hover:text-ast-accent transition-colors"
                            >
                              Mark all read
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setAlertsOpen(false)}
                            className="text-[10px] text-ast-muted hover:text-ast-pink transition-colors"
                            aria-label="Close alerts"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {alertsLoading ? (
                          <p className="px-3 py-3 text-xs text-ast-muted">Loading alerts…</p>
                        ) : alerts.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-ast-muted">No unread alerts.</p>
                        ) : (
                          alerts.map((alert) => {
                            const { summary, entity } = describeAlert(alert);
                            return (
                              <button
                                key={alert.id}
                                type="button"
                                onClick={() => openAlert(alert)}
                                className="w-full text-left px-3 py-2 border-b border-ast-border/50 hover:bg-ast-accent/5 transition-colors flex items-start gap-2"
                              >
                                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-ast-pink flex-shrink-0" />
                                <span className="flex-1 min-w-0">
                                  <span className="block text-xs text-ast-text leading-snug line-clamp-2">
                                    {summary}
                                  </span>
                                  <span className="block text-[10px] text-ast-muted mt-0.5">
                                    {entity ? `${entity} · ` : ""}open ↗
                                  </span>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {userEmail && (
              <Link
                href="/profile"
                className="w-7 h-7 rounded-full bg-ast-accent/20 border border-ast-accent/40 flex items-center justify-center text-ast-accent text-xs font-semibold hover:bg-ast-accent/30 transition-colors"
                title={displayName || userEmail || 'Profile'}
              >
                {getAvatarInitials()}
              </Link>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden sm:inline text-ast-muted hover:text-ast-accent text-xs transition-colors"
              >
                ⚙ Admin
              </Link>
            )}
            <button
              onClick={handleSignOut}
              className="text-ast-muted hover:text-red-400 text-xs transition-colors"
              title="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Ticker bar */}
        <TickerBar />
      </div>
    </header>
  );
}
