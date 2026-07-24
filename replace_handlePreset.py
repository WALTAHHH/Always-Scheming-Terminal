import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    lines = f.readlines()

# replace lines 37-60 (zero-index 36-60 exclusive? slice 36:60)
start_idx = 36  # line 37 - 1
end_idx = 60    # line 60 inclusive -> slice end index = 60 (since exclusive we want up to line 60 inclusive => end_idx = 60? Actually line 60 is index 59. Let's compute: line numbers start at 1. line 37 index 36, line 60 index 59. So slice indices 36:60 (since exclusive end is 60) includes indices 36..59.
# Let's double-check: we'll use line numbers we know.
# We'll just replace from start_idx to the line that contains '  };' after start_idx.
for i in range(start_idx, len(lines)):
    if lines[i].strip() == '};':
        end_idx = i + 1  # exclusive
        break
else:
    end_idx = start_idx + 24  # fallback

print(f'Replacing lines {start_idx+1} to {end_idx}')

new_text = '''  const handlePreset = async (url: string) => {
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
  };
'''

# split into lines
new_lines = new_text.splitlines(keepends=True)
if not new_lines[-1].endswith('\n'):
    new_lines[-1] += '\n'

lines[start_idx:end_idx] = new_lines

with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.writelines(lines)

print('handlePreset replaced')
