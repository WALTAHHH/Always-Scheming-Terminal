"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createAuthBrowserClient } from "@/lib/supabase";
import { Profile, UserPreferences } from "@/lib/database.types";

// 9 segments from company-list-v1.md
const SEGMENTS = [
  "Platform Holders & Big Tech",
  "Major Western Publishers",
  "Major Asian Publishers",
  "Mobile-First / F2P Specialists",
  "PC/Console Studios & Indies",
  "Mid-Market / European Publishers",
  "Infrastructure / Middleware / Services",
  "Investment / Holding / Corporate",
];

// Available themes from tagger.ts
const AVAILABLE_THEMES = [
  "ai",
  "ugc",
  "live-services",
  "cloud-gaming",
  "vr-ar",
  "blockchain",
  "esports",
  "indie",
];

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
        }
      } catch (err) {
        console.error("Failed to fetch profile", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router, supabase]);

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

  const handleAddInterest = async (value?: string) => {
    const interestValue = value || interestInput.trim();
    if (!interestValue || interests.includes(interestValue)) {
      setInterestInput("");
      return;
    }

    const newInterests = [...interests, interestValue];
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

  const handleToggleSegment = async (segment: string) => {
    const newSegments = segments.includes(segment)
      ? segments.filter((s) => s !== segment)
      : [...segments, segment];
    
    setSegments(newSegments);

    try {
      await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: newSegments }),
      });
    } catch (err) {
      console.error("Failed to save segments", err);
    }
  };

  const getInitials = (emailOrName: string) => {
    const name = emailOrName.split("@")[0];
    return name.substring(0, 2).toUpperCase();
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
          onClick={() => router.push('/')}
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
                <div className="text-xs text-ast-muted">Initials only for now</div>
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

            <div className="space-y-3 mb-3">
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddInterest(e.target.value);
                    e.target.value = ""; // Reset select
                  }
                }}
                className="w-full bg-ast-bg border border-ast-border rounded px-3 py-1.5 text-sm text-ast-text focus:border-ast-accent focus:outline-none"
              >
                <option value="">Select a topic...</option>
                {AVAILABLE_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>

              <div>
                <label className="block text-xs text-ast-muted mb-1.5">Or add custom:</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={interestInput}
                    onChange={(e) => setInterestInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleAddInterest()}
                    placeholder="Add an interest"
                    className="flex-1 px-3 py-2 bg-ast-bg border border-ast-border rounded text-ast-text focus:outline-none focus:ring-2 focus:ring-ast-accent"
                  />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      handleAddInterest();
                    }}
                    className="px-4 py-2 bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/90"
                  >
                    Add
                  </button>
                </div>
              </div>
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
                  key={segment}
                  className="flex items-center gap-3 p-2 hover:bg-ast-bg/50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={segments.includes(segment)}
                    onChange={() => handleToggleSegment(segment)}
                    className="w-4 h-4 rounded border-ast-border text-ast-accent focus:ring-ast-accent"
                  />
                  <span className="text-sm text-ast-text">{segment}</span>
                </label>
              ))}
            </div>
          </section>

          {/* 4. Notifications (stub) */}
          <section className="bg-ast-surface border border-ast-border rounded-lg p-6 opacity-60">
            <h2 className="text-lg font-semibold text-ast-text mb-4">
              Notifications <span className="text-xs text-ast-pink ml-2">Coming soon</span>
            </h2>
            <p className="text-sm text-ast-muted mb-4">
              Email notifications for breaking news and digests
            </p>

            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-not-allowed">
                <input
                  type="checkbox"
                  disabled
                  className="w-4 h-4 rounded border-ast-border opacity-50"
                />
                <div>
                  <div className="text-sm text-ast-muted">Breaking News</div>
                  <div className="text-xs text-ast-muted">Major announcements and developments</div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-not-allowed">
                <input
                  type="checkbox"
                  disabled
                  className="w-4 h-4 rounded border-ast-border opacity-50"
                />
                <div>
                  <div className="text-sm text-ast-muted">Daily Digest</div>
                  <div className="text-xs text-ast-muted">Summary of top stories</div>
                </div>
              </label>
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
