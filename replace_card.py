import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    content = f.read()

old = '''<div key={endpoint.path} className=\"border border-ast-border bg-ast-surface rounded-lg p-3\">
                <div className=\"font-mono text-ast-accent text-xs mb-1\">{endpoint.path}</div>
                <div className=\"text-ast-muted text-xs mb-2\">{endpoint.description}</div>
                <button
                  onClick={() => endpoint.isDeals ? handleRecentDeals() : handlePreset(endpoint.url)}
                  disabled={loading}
                  className=\"px-3 py-1 text-xs border border-ast-accent/40 text-ast-accent rounded hover:bg-ast-accent/10 disabled:opacity-50 transition-colors\"
                >
                  Run →
                </button>
              </div>'''

new = '''<div key={endpoint.path} className=\"border border-ast-border bg-ast-surface rounded-lg p-3\">
                <div className=\"font-mono text-ast-accent text-xs mb-1\">{endpoint.path}</div>
                <div className=\"text-ast-muted text-xs mb-2\">{endpoint.description}</div>
                <span className={\`text-[9px] px-1 py-0.5 rounded \${endpoint.requiresKey ? \"bg-ast-gold/10 text-ast-gold border border-ast-gold/20\" : \"bg-ast-mint/10 text-ast-mint border border-ast-mint/20\"}\`}>
                  {endpoint.requiresKey ? \"API key\" : \"public\"}
                </span>
                <button
                  onClick={() => endpoint.isDeals ? handleRecentDeals() : handlePreset(endpoint.url)}
                  disabled={loading}
                  className=\"px-3 py-1 text-xs border border-ast-accent/40 text-ast-accent rounded hover:bg-ast-accent/10 disabled:opacity-50 transition-colors\"
                >
                  Run →
                </button>
              </div>'''

if old not in content:
    print("Old block not found")
    sys.exit(1)

content = content.replace(old, new)

with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.write(content)

print("Added badge to endpoint cards")
