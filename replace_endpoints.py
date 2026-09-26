import sys

with open('src/app/api-explorer/page.tsx', 'r') as f:
    content = f.read()

old = '''  const endpoints = [
      { 
        path: \"GET /api/v1/signals\", 
        description: \"Top investment signals (public)\",
        url: \"/api/v1/signals\",
        requiresAuth: false
      },
      { 
        path: \"GET /api/v1/items?limit=10\", 
        description: \"Latest news items (requires API key)\",
        url: \"/api/v1/items?limit=10\",
        requiresAuth: true
      },
      { 
        path: \"GET /api/v1/entities?limit=20\", 
        description: \"Entity directory (requires API key)\",
        url: \"/api/v1/entities?limit=20\",
        requiresAuth: true
      },
      { 
        path: \"GET /api/v1/signals (deals)\", 
        description: \"Recent deals (client-side filtered)\",
        url: \"/api/v1/signals\",
        requiresAuth: false,
        isDeals: true
      },
    ];'''

new = '''  const endpoints = [
      { 
        path: \"GET /api/v1/signals\", 
        description: \"Top investment signals (public)\",
        url: \"/api/v1/signals\",
        requiresAuth: false,
        requiresKey: false
      },
      { 
        path: \"GET /api/v1/items?limit=10\", 
        description: \"Latest news items (requires API key)\",
        url: \"/api/v1/items?limit=10\",
        requiresAuth: true,
        requiresKey: true
      },
      { 
        path: \"GET /api/v1/entities?limit=20\", 
        description: \"Entity directory (requires API key)\",
        url: \"/api/v1/entities?limit=20\",
        requiresAuth: true,
        requiresKey: true
      },
      { 
        path: \"GET /api/v1/signals (deals)\", 
        description: \"Recent deals (client-side filtered)\",
        url: \"/api/v1/signals\",
        requiresAuth: false,
        requiresKey: false,
        isDeals: true
      },
    ];'''

if old not in content:
    print("Old block not found")
    sys.exit(1)

content = content.replace(old, new)

with open('src/app/api-explorer/page.tsx', 'w') as f:
    f.write(content)

print("Updated endpoints array")
