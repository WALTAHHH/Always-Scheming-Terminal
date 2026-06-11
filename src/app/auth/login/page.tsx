"use client";

import { useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createAuthBrowserClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignUp) {
        // Validate invite code on signup
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

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        // Show success message
        setError("Check your email to confirm your account!");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        // Redirect to home
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
    <div className="min-h-screen bg-[#0a0e27] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Always Scheming Terminal
          </h1>
          <p className="text-gray-400">
            {isSignUp ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[#1a1f3a] rounded-lg p-8 space-y-6"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-[#0a0e27] border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 bg-[#0a0e27] border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {isSignUp && (
            <div>
              <label
                htmlFor="inviteCode"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Invite Code
              </label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                className="w-full px-4 py-2 bg-[#0a0e27] border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-md p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-md transition-colors"
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setInviteCode("");
              }}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Need an account? Sign up"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
