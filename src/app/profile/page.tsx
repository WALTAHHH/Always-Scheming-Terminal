"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createAuthBrowserClient } from "@/lib/supabase";
import { Profile, UserPreferences } from "@/lib/database.types";
import {
  fetchWatchlist,
  unwatchEntity,
  type WatchlistEntry,
} from "@/lib/watchlist";

// 9 segments from company-list-v1.md
const SEGMENTS = [
  { name: 'Platform Holders & Big Tech', description: 'Microsoft (Xbox), Sony (PlayStation), Nintendo, Apple, Google, Meta, Valve, Epic, Roblox' },
  { name: 'Major Western Publishers', description: 'EA, Take-Two, Ubisoft, Embracer, CD Projekt, Devolver' },
  { name: 'Major Asian Publishers', description: 'Tencent, NetEase, Nexon, Krafton, Bandai Namco, Capcom, Square Enix, Sega, miHoYo, Sea Limited' },
  { name: 'Mobile-First / F2P Specialists', description: 'Supercell, AppLovin, Scopely, Dream Games, Niantic, Voodoo' },
  { name: 'PC/Console Studios & Indies', description: 'Larian, Annapurna, Riot, FromSoftware, Activision Blizzard, Bethesda, Bungie' },
  { name: 'Mid-Market / European Publishers', description: 'Paradox, Keywords Studios, Team17, Warner Bros Games, Frontier, Embracer labels' },
  { name: 'Infrastructure / Middleware / Services', description: 'Unity, Discord, Xsolla, Overwolf, ironSource, Twitch' },
  { name: 'Investment / Holding / Corporate', description: 'Savvy Games Group, Kadokawa, tencent holding stakes, private equity' },
];

// Default watchlist alert threshold (spec §2.3 + Matt's decision: 0.75, not 0.65).
// Mirrors the DB default on user_preferences.watchlist_min_score.
const DEFAULT_WATCHLIST_MIN_SCORE = 0.75;

// Exact empty-state copy for the Following section (spec §5.4). Kept as a
// literal constant so source-assertion/copy tests can match it verbatim.
const FOLLOWING_EMPTY_STATE =
  "You're not watching any companies yet. Open any company from the feed and tap ★ Watch.";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createAuthBrowserClient();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  
  // Form state
  const [displayName, setDisplayName] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState("");
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);

  // Segment save state (issue #112): explicit Save button + dirty tracking.
  // The checkbox list autosaved silently before, so users had no visible
  // trigger or confirmation that their selection was persisted.
  const [savedSegments, setSavedSegments] = useState<string[]>([]);
  const [segmentStatus, setSegmentStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // Following / notification preferences (spec §5.4–§5.5).
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [unwatching, setUnwatching] = useState<string | null>(null);
  // Full notification_prefs blob, round-tripped so we don't clobber other keys.
  const [notificationPrefs, setNotificationPrefs] = useState<
    Record<string, unknown>
  >({});
  const [digestEnabled, setDigestEnabled] = useState(false);
  const [minScore, setMinScore] = useState(DEFAULT_WATCHLIST_MIN_SCORE);
  const [prefsStatus, setPrefsStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  useEffect(() => {
    const fetchData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        router.push("/auth/login");
        return;
      }

      setEmail(session.user.email || "");

      try {
        const response = await fetch("/api/user/preferences");
        if (response.ok) {
          const data = await response.json();
          setProfile(data.profile);
          setPreferences(data.preferences);
          setDisplayName(data.profile.display_name || "");
          setInterests(data.preferences.interests || []);
          setSegments(data.preferences.segments || []);
          setSavedSegments(data.preferences.segments || []);

          // Hydrate notification preferences (spec §5.5). watchlist_email is the
          // canonical weekly-digest gate (see fan-out lib + unsubscribe route);
          // `digest` is mirrored by the toggle so both names stay in sync.
          const blob = (data.preferences?.notification_prefs ?? {}) as Record<
            string,
            unknown
          >;
          setNotificationPrefs(blob);
          setDigestEnabled(
            blob.watchlist_email === true || blob.digest === true
          );
          setMinScore(
            typeof data.preferences?.watchlist_min_score === "number"
              ? data.preferences.watchlist_min_score
              : DEFAULT_WATCHLIST_MIN_SCORE
          );
        }

        // Watched entities for the Following list (spec §5.4). Fails soft to [].
        const watched = await fetchWatchlist();
        setWatchlist(watched.data);

        // Fetch available themes
        const themesResponse = await fetch("/api/tags/themes");
        if (themesResponse.ok) {
          const themesData = await themesResponse.json();
          setAvailableThemes(themesData.themes || []);
        }
      } catch (err) {
        console.error("Failed to fetch profile", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router, supabase]);

  // Auto-dismiss the "Saved" confirmation after a short delay.
  useEffect(() => {
    if (segmentStatus !== "saved") return;
    const timer = setTimeout(() => setSegmentStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [segmentStatus]);

  // Auto-dismiss the notification-prefs "Saved" confirmation.
  useEffect(() => {
    if (prefsStatus !== "saved") return;
    const timer = setTimeout(() => setPrefsStatus("idle"), 2500);
    return () => clearTimeout(timer);
  }, [prefsStatus]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  const handleSaveDisplayName = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName }),
      });

      if (response.ok) {
        setProfile((prev) => prev ? { ...prev, display_name: displayName } : null);
      }
    } catch (err) {
      console.error("Failed to save display name", err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddInterest = async () => {
    if (!interestInput.trim() || interests.includes(interestInput.trim())) {
      setInterestInput("");
      return;
    }

    const newInterests = [...interests, interestInput.trim()];
    setInterests(newInterests);
    setInterestInput("");

    // Save immediately
    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests: newInterests }),
      });
    } catch (err) {
      console.error("Failed to save interests", err);
    }
  };

  const handleRemoveInterest = async (interest: string) => {
    const newInterests = interests.filter((i) => i !== interest);
    setInterests(newInterests);

    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests: newInterests }),
      });
    } catch (err) {
      console.error("Failed to save interests", err);
    }
  };

  // Toggle a segment locally only — the change is persisted when the user
  // clicks "Save preferences" (issue #112). Previously this autosaved with no
  // visible trigger or feedback.
  const handleToggleSegment = (segmentName: string) => {
    setSegments((prev) =>
      prev.includes(segmentName)
        ? prev.filter((s) => s !== segmentName)
        : [...prev, segmentName]
    );
    setSegmentStatus("idle");
  };

  // True when the local segment selection differs from what is persisted.
  const segmentsDirty =
    segments.length !== savedSegments.length ||
    segments.some((s) => !savedSegments.includes(s));

  const handleSaveSegments = async () => {
    setSegmentStatus("saving");
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save segments (${response.status})`);
      }

      setSavedSegments(segments);
      setSegmentStatus("saved");
    } catch (err) {
      console.error("Failed to save segments", err);
      setSegmentStatus("error");
    }
  };

  const getInitials = (emailOrName: string) => {
    const name = emailOrName.split("@")[0];
    return name.substring(0, 2).toUpperCase();
  };

  // --- Following list (spec §5.4) -----------------------------------------
  // Optimistically remove the row, revert if the DELETE fails. The watchlist
  // helper never throws (returns false on failure), so revert is straightforward.
  const handleUnwatch = async (entityId: string) => {
    const previous = watchlist;
    setUnwatching(entityId);
    setWatchlist((prev) =>
      prev.filter((entry) => entry.entity_id !== entityId)
    );

    const ok = await unwatchEntity(entityId);
    if (!ok) {
      setWatchlist(previous); // revert optimistic removal
    }
    setUnwatching(null);
  };

  // --- Notification preferences (spec §5.5) -------------------------------
  // Persist a partial update through the existing PATCH /api/user/preferences.
  const saveNotificationPrefs = async (payload: Record<string, unknown>) => {
    setPrefsStatus("saving");
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Failed to save preferences (${response.status})`);
      }
      setPrefsStatus("saved");
    } catch (err) {
      console.error("Failed to save notification preferences", err);
      setPrefsStatus("error");
    }
  };

  // Weekly digest on/off. Writes watchlist_email (canonical gate, read by the
  // fan-out + unsubscribe routes) and mirrors `digest`; digest_frequency keeps
  // the typed column coherent ('weekly' when on, 'off' when off).
  const handleToggleDigest = async () => {
    const next = !digestEnabled;
    const nextBlob = {
      ...notificationPrefs,
      watchlist_email: next,
      digest: next,
    };
    setDigestEnabled(next);
    setNotificationPrefs(nextBlob);
    await saveNotificationPrefs({
      notification_prefs: nextBlob,
      digest_frequency: next ? "weekly" : "off",
    });
  };

  const handleMinScoreChange = async (value: number) => {
    setMinScore(value);
    await saveNotificationPrefs({ watchlist_min_score: value });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ast-bg flex items-center justify-center">
        <div className="text-ast-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ast-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <button
          onClick={() => router.push("/")}
          className="inline-flex items-center gap-2 px-3 py-1.5 mb-6 rounded border border-ast-border text-sm text-ast-text hover:border-ast-accent hover:text-ast-accent transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Terminal
        </button>
        <h1 className="text-2xl font-bold text-ast-text mb-6">Profile Settings</h1>

        <div className="space-y-6">
          {/* 1. Identity */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">Identity</h2>
            
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-ast-accent/20 border-2 border-ast-accent/40 flex items-center justify-center text-ast-accent text-xl font-semibold">
                {getInitials(displayName || email)}
              </div>
              <div className="flex-1">
                <div className="text-sm text-ast-muted mb-1">Avatar</div>
                <div className="text-xs text-ast-muted">Initials from your name or email</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ast-muted mb-2">
                  Display Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-ast-bg border border-ast-border rounded text-ast-text focus:outline-none focus:ring-2 focus:ring-ast-accent"
                    placeholder="Your display name"
                  />
                  <button
                    onClick={handleSaveDisplayName}
                    disabled={saving}
                    className="px-4 py-2 bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/90 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
                {displayName === email.split('@')[0] && (
                  <p className="text-xs text-ast-muted mt-2">
                    Auto-set from your email — feel free to update
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-ast-muted mb-2">
                  Email
                </label>
                <input
                  type="text"
                  value={email}
                  readOnly
                  className="w-full px-3 py-2 bg-ast-bg/50 border border-ast-border rounded text-ast-muted cursor-not-allowed"
                />
              </div>
            </div>
          </section>

          {/* 2. Interests */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">Interests</h2>
            <p className="text-sm text-ast-muted mb-4">
              Topics you care about (e.g., mobile, M&A, PC gaming)
            </p>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddInterest()}
                placeholder="Add an interest"
                list="theme-suggestions"
                className="flex-1 px-3 py-2 bg-ast-bg border border-ast-border rounded text-ast-text focus:outline-none focus:ring-2 focus:ring-ast-accent"
              />
              <datalist id="theme-suggestions">
                {availableThemes.map((theme) => (
                  <option key={theme} value={theme} />
                ))}
              </datalist>
              <button
                onClick={handleAddInterest}
                className="px-4 py-2 bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/90"
              >
                Add
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1 bg-ast-accent/20 border border-ast-accent/40 rounded-full text-sm text-ast-accent flex items-center gap-2"
                >
                  {interest}
                  <button
                    onClick={() => handleRemoveInterest(interest)}
                    className="hover:text-red-400"
                  >
                    ×
                  </button>
                </span>
              ))}
              {interests.length === 0 && (
                <div className="text-sm text-ast-muted">No interests added yet</div>
              )}
            </div>
          </section>

          {/* 3. Segments */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">Entity Segments</h2>
            <p className="text-sm text-ast-muted mb-4">
              Industry segments you want to follow
            </p>

            <div className="space-y-2">
              {SEGMENTS.map((segment) => (
                <label
                  key={segment.name}
                  className="flex items-center gap-3 p-2 hover:bg-ast-bg/50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={segments.includes(segment.name)}
                    onChange={() => handleToggleSegment(segment.name)}
                    className="w-4 h-4 rounded border-ast-border text-ast-accent focus:ring-ast-accent"
                  />
                  <div className="flex-1">
                    <div className="text-sm text-ast-text">{segment.name}</div>
                    <div className="text-xs text-ast-muted">{segment.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Explicit save trigger for segments (issue #112) */}
            <div className="sticky bottom-4 z-10 mt-4 pt-4 border-t border-ast-border flex items-center gap-3 bg-ast-surface/95 backdrop-blur-sm rounded-b">
              <button
                onClick={handleSaveSegments}
                disabled={!segmentsDirty || segmentStatus === "saving"}
                className="px-4 py-2 bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {segmentStatus === "saving" ? "Saving..." : "Save preferences"}
              </button>

              {segmentStatus === "saved" && (
                <span className="text-sm text-ast-accent" role="status">
                  ✓ Saved
                </span>
              )}
              {segmentStatus === "error" && (
                <span className="text-sm text-red-400" role="alert">
                  Failed to save — try again
                </span>
              )}
              {segmentStatus === "idle" && segmentsDirty && (
                <span className="text-sm text-ast-muted">
                  Unsaved changes
                </span>
              )}
            </div>
          </section>

          {/* 4. Following (watched companies) — spec §5.4 */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">Following</h2>
            <p className="text-sm text-ast-muted mb-4">
              Companies you watch. When a high-importance signal lands on one, it
              shows up in your alerts and weekly digest.
            </p>

            {watchlist.length === 0 ? (
              <div
                className="text-sm text-ast-muted"
                data-testid="following-empty"
              >
                {FOLLOWING_EMPTY_STATE}
              </div>
            ) : (
              <ul className="space-y-2">
                {watchlist.map((entry) => (
                  <li
                    key={entry.entity_id}
                    className="flex items-center justify-between gap-3 p-2 bg-ast-bg/50 rounded"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-ast-text truncate">
                        {entry.entity?.canonical_name || entry.entity_id}
                      </div>
                      {entry.entity?.ticker && (
                        <div className="text-xs text-ast-muted">
                          {entry.entity.ticker}
                          {entry.entity.exchange
                            ? ` · ${entry.entity.exchange}`
                            : ""}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnwatch(entry.entity_id)}
                      disabled={unwatching === entry.entity_id}
                      aria-label={`Unwatch ${
                        entry.entity?.canonical_name || entry.entity_id
                      }`}
                      className="shrink-0 px-2 py-1 rounded text-ast-muted hover:text-red-400 hover:bg-ast-bg disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 5. Notifications — spec §5.5 (replaces the disabled stub) */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">
              Notifications
            </h2>
            <p className="text-sm text-ast-muted mb-4">
              Weekly email digest of high-importance signals for the companies
              you follow
            </p>

            <div className="space-y-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={digestEnabled}
                  onChange={handleToggleDigest}
                  className="mt-1 w-4 h-4 rounded border-ast-border text-ast-accent focus:ring-ast-accent"
                />
                <div>
                  <div className="text-sm text-ast-text">
                    Weekly Watchlist Digest
                  </div>
                  <div className="text-xs text-ast-muted">
                    One email a week — the top signals on companies you follow
                  </div>
                </div>
              </label>

              <div>
                <label
                  htmlFor="watchlist-min-score"
                  className="block text-sm font-medium text-ast-muted mb-2"
                >
                  Alert threshold{" "}
                  <span className="text-ast-text">{minScore.toFixed(2)}</span>
                </label>
                <input
                  id="watchlist-min-score"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={minScore}
                  onChange={(e) => handleMinScoreChange(Number(e.target.value))}
                  className="w-full accent-ast-accent"
                />
                <p className="text-xs text-ast-muted mt-2">
                  Only signals scoring {minScore.toFixed(2)} or higher are sent.
                  Default 0.75.
                </p>
              </div>

              {prefsStatus === "saved" && (
                <span className="text-sm text-ast-accent" role="status">
                  ✓ Saved
                </span>
              )}
              {prefsStatus === "error" && (
                <span className="text-sm text-red-400" role="alert">
                  Failed to save — try again
                </span>
              )}
            </div>
          </section>

          {/* 5. Subscription (stub) */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6 opacity-60">
            <h2 className="text-lg font-semibold text-ast-text mb-4">
              Subscription <span className="text-xs text-ast-pink ml-2">Coming soon</span>
            </h2>

            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm text-ast-text font-medium">Current Plan</div>
                <div className="text-xs text-ast-muted">{profile?.subscription_tier || "free"}</div>
              </div>
              <button
                disabled
                className="px-4 py-2 bg-ast-border text-ast-muted rounded font-medium cursor-not-allowed"
              >
                Upgrade to Pro
              </button>
            </div>

            <div className="text-xs text-ast-muted">
              Pro features: API access, priority support, custom feeds
            </div>
            <div className="mt-3">
              <Link
                href="/api-explorer"
                className="text-ast-accent hover:text-ast-accent/80 text-sm underline"
              >
                Open API Explorer →
              </Link>
            </div>
          </section>

          {/* 6. Account */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6">
            <h2 className="text-lg font-semibold text-ast-text mb-4">Account</h2>

            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700"
            >
              Sign Out
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
