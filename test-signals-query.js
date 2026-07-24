#!/usr/bin/env node
// Test script to verify the API response shape matches SignalPanel expectations

const responseShapeExample = {
  id: "signal-id",
  signal_type: "acquisition",
  summary: "Company X acquired Company Y",
  investment_relevance_score: 0.85,
  companies: ["Company X", "Company Y"],
  title: "Article title",
  url: "https://example.com/article",
  published_at: "2024-01-01T00:00:00Z",
  created_at: "2024-01-01T00:00:00Z"
};

console.log("Expected response shape for SignalPanel:");
console.log(JSON.stringify(responseShapeExample, null, 2));

// Check the actual API route structure
const fs = require('fs');
const path = require('path');

const routePath = path.join(__dirname, 'src/app/api/v1/signals/route.ts');
const routeContent = fs.readFileSync(routePath, 'utf8');

console.log("\n=== Current route.ts analysis ===");

// Check for Promise.all loops
const hasPromiseAll = routeContent.includes('Promise.all');
console.log(`Has Promise.all loop: ${hasPromiseAll}`);

// Check for multiple queries
const selectCount = (routeContent.match(/\.select\(/g) || []).length;
console.log(`Number of .select() calls: ${selectCount}`);

// Check for nested relation syntax
const hasNestedSelect = routeContent.includes('content:item_id');
console.log(`Has nested select (content:item_id): ${hasNestedSelect}`);

// Extract mapping logic
const mappingStart = routeContent.indexOf('const signalsWithDetails');
const mappingEnd = routeContent.indexOf('return NextResponse.json');
const mappingCode = routeContent.substring(mappingStart, mappingEnd);

console.log("\nMapping logic snippet:");
console.log(mappingCode.split('\n').slice(0, 20).join('\n'));

// Verify required fields are mapped
const requiredFields = ['id', 'signal_type', 'summary', 'investment_relevance_score', 'companies', 'title', 'url', 'published_at', 'created_at'];
const missingFields = requiredFields.filter(field => !mappingCode.includes(field));

console.log(`\nMissing required fields in mapping: ${missingFields.length > 0 ? missingFields.join(', ') : 'None'}`);

console.log("\n=== Analysis complete ===");
console.log(hasPromiseAll ? "⚠️  WARNING: Still has Promise.all loop (N+1 not fixed)" : "✓ No Promise.all loop");
console.log(selectCount > 1 ? `⚠️  WARNING: ${selectCount} select calls (should be 1)` : "✓ Single select call");
console.log(hasNestedSelect ? "✓ Uses nested relations" : "⚠️  WARNING: No nested relations");
console.log(missingFields.length === 0 ? "✓ All required fields mapped" : `⚠️  WARNING: Missing fields: ${missingFields.join(', ')}`);