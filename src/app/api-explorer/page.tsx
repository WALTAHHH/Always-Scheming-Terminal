"use client";

import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/Header";
// JSON tokenization for syntax highlighting
function tokenizeJson(json: string): { type: string; value: string }[] {
  const tokens: { type: string; value: string }[] = [];
  const re = /(\\\"(?:[^\\\"\\\\]|\\\\.)*\\\")|(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)|\\b(true|false|null)\\b|([{}\\[\\]:,])|\\s+/g;
  let match;
  while ((match = re.exec(json)) !== null) {
    if (match[1]) tokens.push({ type: "string", value: match[1] });
    else if (match[2]) tokens.push({ type: "number", value: match[2] });
    else if (match[3]) tokens.push({ type: "keyword", value: match[3] });
    else if (match[4]) tokens.push({ type: "punct", value: match[4] });
    else tokens.push({ type: "ws", value: match[0] });
  }
  return tokens;
}

function determineTokenTypes(tokens: { type: string; value: string }[]) {
  const typedTokens = [...tokens];
  for (let i = 0; i < typedTokens.length; i++) {
    const token = typedTokens[i];
    if (token.type === "string") {
      // Check if this string is a key: next non-ws token is ":"
      let j = i + 1;
      while (j < typedTokens.length && typedTokens[j].type === "ws") j++;
      if (j < typedTokens.length && typedTokens[j].value === ":") {
        token.type = "key";
      }
    }
  }
  return typedTokens;
}

function colorClass(token: { type: string; value: string }): string {
  switch (token.type) {
    case "key": return "text-ast-accent";
    case "string": return "text-ast-mint";
    case "number": return "text-ast-gold";
    case "keyword":
      if (token.value === "true") return "text-ast-mint";
      if (token.value === "false") return "text-ast-pink";
      return "text-ast-muted"; // null
    case "punct": return "text-ast-muted";
    default: return "text-ast-text";
  }
}

function renderJson(json: string): React.ReactNode[] {
  try {
    const tokens = tokenizeJson(json);
    const typedTokens = determineTokenTypes(tokens);
    const spans: React.ReactNode[] = [];
    for (let i = 0; i < typedTokens.length; i++) {
      const token = typedTokens[i];
      spans.push(
        <span key={i} className={colorClass(token)}>
          {token.value}
        </span>
      );
    }
    return spans;
  } catch (err) {
    // fallback to plain text
    return [<span key="fallback" className="text-ast-text">{json}</span>];
  }
}


export default function ApiExplorerPage() {
  const [apiKey, setApiKey] = useState<string>("");
  const [response, setResponse] = useState<any>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestUrl, setRequestUrl] = useState("/api/v1/signals");
  const [limit, setLimit] = useState(10);
  const [showFullResponse, setShowFullResponse] = useState(false);


  // Load API key from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("ast_api_explorer_key");
    if (saved) setApiKey(saved);
  }, []);

  // Save API key to localStorage whenever it changes
  useEffect(() => {
    if (apiKey.trim()) {
      localStorage.setItem("ast_api_explorer_key", apiKey);
    } else {
      localStorage.removeItem("ast_api_explorer_key");
    }
  }, [apiKey]);

  const presetButtons = [
    { label: "Latest Items", url: "/api/v1/items?limit=10" },
    { label: "Top Signals", url: "/api/v1/signals" },
    { label: "Entities", url: "/api/v1/entities?limit=20" },
    { label: "Items by Company", url: "/api/v1/items?signal_type=company&limit=10" },
    { label: "Recent Deals", url: "/api/v1/signals" },
  ];

  const handlePreset = async (url: string) => {
    setLoading(true);
    // Apply limit to URL
    let finalUrl = url;
    if (url.includes("limit=")) {
      finalUrl = url.replace(/limit=\d+/, `limit=${limit}`);
    } else {
      finalUrl = `${url}${url.includes("?") ? "&" : "?"}limit=${limit}`;
    }
    setRequestUrl(finalUrl);
    setResponse(null);
    setStatus(null);
    try {
      const headers: HeadersInit = {};
      if (finalUrl !== "/api/v1/signals") {
        if (!apiKey.trim()) {
          throw new Error("API key required for this endpoint");
        }
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }
      const res = await fetch(finalUrl, { headers });
      setStatus(res.status);
      const data = await res.json();
      setResponse(data);
    } catch (err) {
      setStatus(0);
      setResponse({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const handleRecentDeals = async () => {
    // Special handling: fetch signals then filter client-side for signal_type=deal
    const url = "/api/v1/signals";
    setLoading(true);
    setRequestUrl(url);
    setResponse(null);
    setStatus(null);
    try {
      const res = await fetch(url);
      setStatus(res.status);
      const data = await res.json();
      // Filter for deals
      const deals = Array.isArray(data) ? data.filter((item: any) => item.signal_type === "deal") : [];
      setResponse(deals);
    } catch (err) {
      setStatus(0);
      setResponse({ error: String(err) });
    } finally {
      setLoading(false);
    }
  };

  const formatJson = (obj: any) => JSON.stringify(obj, null, 2);

  const responseLines = response ? formatJson(response).split("\n") : [];
  const displayLines = showFullResponse ? responseLines : responseLines.slice(0, 200);
  const truncatedJson = displayLines.join("\n");
  const truncated = responseLines.length > 200 && !showFullResponse;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-ast-border sticky top-0 z-50 bg-ast-bg/95 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-ast-text text-sm font-semibold tracking-wide">API EXPLORER</h1>
            <p className="text-ast-muted text-xs">Live queries against /api/v1</p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* API Key input */}
        <div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">
          <h2 className="text-ast-accent text-xs font-semibold tracking-wide uppercase mb-2">API Key</h2>
          <p className="text-sm text-ast-muted mb-3">
            Store your key locally — used for authenticated endpoints (except /api/v1/signals).
          </p>
          <div className="flex gap-3">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key here"
              className="flex-1 bg-ast-bg border border-ast-border rounded px-3 py-2 text-ast-text placeholder:text-ast-muted focus:border-ast-accent focus:outline-none"
            />
            <button
              onClick={() => {
                if (apiKey.trim()) {
                  localStorage.setItem("ast_api_explorer_key", apiKey);
                  alert("API key saved");
                }
              }}
              className="px-4 py-2 bg-ast-accent text-ast-bg rounded font-medium hover:bg-ast-accent/80 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => {
                setApiKey("");
                localStorage.removeItem("ast_api_explorer_key");
              }}
              className="px-4 py-2 border border-ast-border text-ast-muted rounded hover:text-ast-text transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Preset buttons */}
        <div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">
          <div className="flex items-center justify-between mb-3">
            <span className="text-ast-accent text-xs font-semibold tracking-wide uppercase">Quick Presets</span>
            <label className="flex items-center gap-2 text-xs text-ast-muted">
              Limit
              <input type="number" min={1} max={100} value={limit} onChange={e => setLimit(Number(e.target.value))} className="bg-ast-bg border border-ast-border rounded px-2 py-1 text-xs text-ast-text w-16" />
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            {presetButtons.map((preset) => (
              <button
                key={preset.label}
                onClick={() => preset.label === "Recent Deals" ? handleRecentDeals() : handlePreset(preset.url)}
                disabled={loading}
                className="px-4 py-2 border border-ast-accent/30 text-ast-accent bg-ast-accent/10 rounded hover:bg-ast-accent/20 disabled:opacity-50 transition-colors"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Request URL */}
        <div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">
          <h3 className="text-ast-accent text-xs font-semibold tracking-wide uppercase mb-2">Request URL</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={requestUrl}
              onChange={(e) => setRequestUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePreset(requestUrl)}
              className="flex-1 bg-ast-bg border border-ast-border rounded px-3 py-2 text-xs font-mono text-ast-text focus:border-ast-accent focus:outline-none"
            />
            <button onClick={() => handlePreset(requestUrl)} className="px-3 py-2 text-xs border border-ast-accent/40 text-ast-accent rounded hover:bg-ast-accent/10 transition-colors">
              Run
            </button>
          </div>
        </div>

        {/* Response panel */}
        <div className="border border-ast-border rounded-lg overflow-hidden bg-ast-surface">
          <div className="bg-ast-surface px-3 py-2 border-b border-ast-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-ast-accent text-xs font-semibold tracking-wide uppercase">Response</h3>
              {status !== null && (
                <span
                  className={`px-2 py-1 text-xs font-bold rounded ${
                    status >= 200 && status < 300
                      ? "bg-ast-mint/20 text-ast-mint border border-ast-mint/30"
                      : status >= 400 && status < 500
                      ? "bg-ast-pink/20 text-ast-pink border border-ast-pink/30"
                      : "bg-ast-gold/20 text-ast-gold border border-ast-gold/30"
                  }`}
                >
                  HTTP {status}
                </span>
              )}
            </div>
            {truncated && (
              <button
                onClick={() => setShowFullResponse(!showFullResponse)}
                className="text-xs text-ast-accent hover:text-ast-accent/80"
              >
                {showFullResponse ? "Show less" : "Show full response"}
              </button>
            )}
          </div>
          <div className="p-4">
            {loading ? (
              <div className="text-ast-muted italic">Loading...</div>
            ) : response === null ? (
              <div className="text-ast-muted italic">No response yet — click a preset to fetch data.</div>
            ) : (
              <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-ast-bg border border-ast-border rounded p-3 overflow-x-auto max-h-[600px] overflow-y-auto">
                {renderJson(truncatedJson)}
              </pre>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
