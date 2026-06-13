"use client";

import { useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Image from "next/image";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createAuthBrowserClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isSignUp) {
        const requiredCode = process.env.NEXT_PUBLIC_BETA_INVITE_CODE;
        if (!requiredCode) {
          setError("Beta invites are not configured");
          setLoading(false);
          return;
        }
        if (inviteCode !== requiredCode) {
          setError("Invalid invite code");
          setLoading(false);
          return;
        }
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        setSuccess("Check your email to confirm your account.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push("/");
        router.refresh();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ast-bg flex items-center justify-center p-4">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(119,196,217,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(119,196,217,0.03) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo + wordmark */}
        <div className="flex flex-col items-center mb-10">
          <div className="flex items-center gap-3 mb-3">
            <Image src="/logo.png" alt="Always Scheming" width={32} height={32} className="w-7 h-7" />
            <span className="font-mono font-semibold text-base tracking-tight">
              <span className="text-ast-accent">Always</span>
              <span className="text-ast-pink"> Scheming</span>
              <span className="text-ast-text"> Terminal</span>
            </span>
          </div>
          <p className="text-xs text-ast-muted font-mono tracking-wider uppercase">
            Gaming industry intelligence
          </p>
        </div>

        {/* Card */}
        <div className="bg-ast-surface border border-ast-border rounded-lg overflow-hidden">
          {/* Tab strip */}
          <div className="flex border-b border-ast-border">
            <button
              type="button"
              onClick={() => { setIsSignUp(false); setError(""); setSuccess(""); }}
              className={`flex-1 py-3 text-xs font-mono font-medium tracking-wider uppercase transition-colors ${
                !isSignUp
                  ? "text-ast-accent border-b-2 border-ast-accent bg-ast-accent/5"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsSignUp(true); setError(""); setSuccess(""); }}
              className={`flex-1 py-3 text-xs font-mono font-medium tracking-wider uppercase transition-colors ${
                isSignUp
                  ? "text-ast-accent border-b-2 border-ast-accent bg-ast-accent/5"
                  : "text-ast-muted hover:text-ast-text"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-[10px] font-mono text-ast-muted uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded text-sm text-ast-text font-mono placeholder:text-ast-muted/40 focus:outline-none focus:border-ast-accent focus:ring-1 focus:ring-ast-accent/30 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-ast-muted uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                placeholder="••••••••"
                className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded text-sm text-ast-text font-mono placeholder:text-ast-muted/40 focus:outline-none focus:border-ast-accent focus:ring-1 focus:ring-ast-accent/30 transition-colors"
              />
            </div>

            {isSignUp && (
              <div>
                <label className="block text-[10px] font-mono text-ast-muted uppercase tracking-wider mb-1.5">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  autoComplete="off"
                  placeholder="XXXXXXXX"
                  className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded text-sm text-ast-text font-mono placeholder:text-ast-muted/40 focus:outline-none focus:border-ast-accent focus:ring-1 focus:ring-ast-accent/30 transition-colors tracking-widest"
                />
                <p className="text-[10px] text-ast-muted font-mono mt-1.5">
                  Private beta — invite required
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 px-3 py-2 bg-ast-pink/10 border border-ast-pink/30 rounded text-xs text-ast-pink font-mono">
                <span className="mt-0.5 flex-shrink-0">✕</span>
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 px-3 py-2 bg-ast-mint/10 border border-ast-mint/30 rounded text-xs text-ast-mint font-mono">
                <span className="mt-0.5 flex-shrink-0">✓</span>
                <span>{success}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 bg-ast-accent text-ast-bg text-sm font-mono font-semibold rounded hover:bg-ast-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors tracking-wide"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 border border-ast-bg/40 border-t-ast-bg rounded-full animate-spin" />
                  {isSignUp ? "Creating account..." : "Signing in..."}
                </span>
              ) : (
                isSignUp ? "Create Account →" : "Sign In →"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-ast-muted/50 font-mono mt-6 tracking-wide">
          Private beta · Invite only
        </p>
      </div>
    </div>
  );
}
