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
  const [showPassword, setShowPassword] = useState(false);
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
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pr-10 bg-ast-bg border border-ast-border rounded text-sm text-ast-text font-mono placeholder:text-ast-muted/40 focus:outline-none focus:border-ast-accent focus:ring-1 focus:ring-ast-accent/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-ast-muted hover:text-ast-text transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    // eye-off
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    // eye
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
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
