import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    lines = f.readlines()

# handlePreset lines 38-62 inclusive (zero-index 37-62)
start = 37  # line 38 - 1
end = 62    # line 62 (inclusive) -> slice end index = 62 (since exclusive we want up to line 62 inclusive -> end = 63)
# Actually we need to include the line with '  };' which is line 62? Let's check.
# We'll compute end index as line number of the last line we want to replace (line 62) + 1
# Let's find the line with '  };' after start. We'll just hardcode for now.
# We'll replace lines[start:end] where end is line index after the last line.
# We'll search for pattern '  };' after start.
for i in range(start, len(lines)):
    if lines[i].strip() == '};':
        end = i + 1
        break
else:
    end = start + 25  # fallback

print(f'Replacing lines {start+1} to {end}')

new_lines = [
'  const handlePreset = async (url: string) => {\n',
'    setLoading(true);\n',
'    // Apply limit to URL\n',
'    let finalUrl = url;\n',
'    if (url.includes("limit=")) {\n',
'      finalUrl = url.replace(/limit=\\\\d+/, `limit=${limit}`);\n',
'    } else {\n',
'      finalUrl = `${url}${url.includes("?") ? "&" : "?"}limit=${limit}`;\n',
'    }\n',
'    setRequestUrl(finalUrl);\n',
'    setResponse(null);\n',
'    setStatus(null);\n',
'    try {\n',
'      const headers: HeadersInit = {};\n',
'      if (finalUrl !== "/api/v1/signals") {\n',
'        if (!apiKey.trim()) {\n',
'          throw new Error("API key required for this endpoint");\n',
'        }\n',
'        headers["Authorization"] = `Bearer ${apiKey.trim()}`;\n',
'      }\n',
'      const res = await fetch(finalUrl, { headers });\n',
'      setStatus(res.status);\n',
'      const data = await res.json();\n',
'      setResponse(data);\n',
'    } catch (err) {\n',
'      setStatus(0);\n',
'      setResponse({ error: String(err) });\n',
'    } finally {\n',
'      setLoading(false);\n',
'    }\n',
'  };\n'
]

# Ensure new_lines have correct line endings (they already have \n)
lines[start:end] = new_lines

with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.writelines(lines)

print('handlePreset replaced')
