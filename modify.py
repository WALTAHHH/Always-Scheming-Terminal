import re
import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    content = f.read()

# 1. Replace handlePreset
old_handle_preset = r'  const handlePreset = async \(url: string\) => \{[\s\S]*?\n  \};'
new_handle_preset = '''  const handlePreset = async (url: string) => {
    setLoading(true);
    // Apply limit to URL
    let finalUrl = url;
    if (url.includes("limit=")) {
      finalUrl = url.replace(/limit=\\d+/, `limit=${limit}`);
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
  };'''
if re.search(old_handle_preset, content):
    content = re.sub(old_handle_preset, new_handle_preset, content, flags=re.DOTALL)
else:
    print("handlePreset not found")
    sys.exit(1)

# 2. Replace handleRecentDeals
old_recent_deals = r'  const handleRecentDeals = async \(\) => \{[\s\S]*?\n  \};'
new_recent_deals = '''  const handleRecentDeals = async () => {
    // Special handling: fetch signals then filter client-side for signal_type=deal
    let url = "/api/v1/signals";
    // Apply limit
    if (url.includes("limit=")) {
      url = url.replace(/limit=\\d+/, `limit=${limit}`);
    } else {
      url = `${url}${url.includes("?") ? "&" : "?"}limit=${limit}`;
    }
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
  };'''
if re.search(old_recent_deals, content):
    content = re.sub(old_recent_deals, new_recent_deals, content, flags=re.DOTALL)
else:
    print("handleRecentDeals not found")
    sys.exit(1)

# 3. Replace presets section
old_preset_section = r'        {/* Preset buttons */}\s*<div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">[\s\S]*?        </div>'
new_preset_section = '''        {/* Preset buttons */}
        <div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">
          <div className="flex items-center justify-between mb-3">
            <span className="text-ast-accent text-xs font-semibold tracking-wide uppercase">Quick Presets</span>
            <label className="flex items-center gap-2 text-xs text-ast-muted">
              Limit
              <input
                type="number"
                min={1}
                max={100}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="bg-ast-bg border border-ast-border rounded px-2 py-1 text-xs text-ast-text w-16"
              />
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
        </div>'''
if re.search(old_preset_section, content):
    content = re.sub(old_preset_section, new_preset_section, content, flags=re.DOTALL)
else:
    print("preset section not found")
    sys.exit(1)

# 4. Replace request URL block
old_url_block = r'        {/* Request URL */}\s*\{requestUrl && \([\s\S]*?        \)\}'
new_url_block = '''        {/* Request URL */}
        <div className="border border-ast-border rounded-lg px-4 py-3 bg-ast-surface">
          <h3 className="text-ast-accent text-xs font-semibold tracking-wide uppercase mb-2">Request URL</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={requestUrl}
              onChange={(e) => setRequestUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handlePreset(requestUrl)}
              className="flex-1 bg-ast-bg border border-ast-border rounded px-3 py-2 text-xs font-mono text-ast-text focus:border-ast-accent focus:outline-none"
            />
            <button onClick={() => handlePreset(requestUrl)} className="px-3 py-2 text-xs border border-ast-accent/40 text-ast-accent rounded hover:bg-ast-accent/10 transition-colors">
              Run
            </button>
          </div>
        </div>'''
if re.search(old_url_block, content):
    content = re.sub(old_url_block, new_url_block, content, flags=re.DOTALL)
else:
    print("request URL block not found")
    sys.exit(1)

# Write back
with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.write(content)

print("All replacements done")
