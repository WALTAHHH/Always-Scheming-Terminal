const fs = require('fs');
let content = fs.readFileSync('src/components/SignalPanel.tsx', 'utf8');

// Fix the TimeAgo placement
content = content.replace(
  /<span className={`\$\{scoreColor\} text-\[10px\]`}>\s*● \{signal\.investment_relevance_score\.toFixed\(2\)\}\s*<\/span>\s*\{signal\.companies\.length > 0 && \(\s*<TimeAgo date=\{signal\.created_at\} className="text-ast-muted text-\[10px\]" \/>\s*<div className="flex gap-1">/g,
  `<span className={\`\${scoreColor} text-[10px]\`}>\n                              ● {signal.investment_relevance_score.toFixed(2)}\n                            </span>\n                            <TimeAgo date={signal.created_at} className="text-ast-muted text-[10px]" />\n                            {signal.companies.length > 0 && (\n                              <div className="flex gap-1">`
);

// Replace the deals memo
content = content.replace(
  /  \/\/ Compute deals \(Fundraising, M&A, Earnings\)\n  const deals = useMemo<Deal\[\]>\(\(\) => {\n    const dealCategories = new Set\(\["fundraising", "m-and-a", "earnings"\]\);\n    \n    const dealItems = filteredItems.filter\(\(item\) => {\n      const tags = \(item\.tags as Record<string, string\[\]>\) \|\| \{\};\n      const categories = tags\.category \|\| \[\];\n      return categories\.some\(\(c\) => dealCategories\.has\(c\)\);\n    }\);\n    \n    dealItems\.sort\(\(a, b\) => {\n      const aTime = a\.published_at \? new Date\(a\.published_at\)\.getTime\(\) : 0;\n      const bTime = b\.published_at \? new Date\(b\.published_at\)\.getTime\(\) : 0;\n      return bTime - aTime;\n    }\);\n    \n    return dealItems\.slice\(0, 5\)\.map\(\(item\) => {\n      const tags = \(item\.tags as Record<string, string\[\]>\) \|\| \{\};\n      const categories = tags\.category \|\| \[\];\n      const category = categories\.find\(\(c\) => dealCategories\.has\(c\)\) as Deal\["category"\] \|\| "fundraising";\n      \n      return {\n        id: item\.id,\n        title: item\.title,\n        source: item\.sources\?\.name \|\| "Unknown",\n        sourceUrl: item\.sources\?\.url \|\| "",\n        category,\n        companies: \(tags\.company \|\| \[\]\)\.slice\(0, 3\),\n        publishedAt: item\.published_at,\n        url: item\.url,\n      };\n    }\);\n  }, \[filteredItems\]\);/,
`  // Compute deals (Fundraising, M&A, Earnings) from signals table
  const deals = useMemo<Deal[]>(() => {
    const dealSignals = signals.filter(s =>
      ['fundraising', 'acquisition', 'earnings'].includes(s.signal_type)
    );
    
    // Map to Deal interface
    return dealSignals.slice(0, 5).map((signal) => {
      const category = signal.signal_type === 'acquisition' ? 'm-and-a' : 
                      signal.signal_type === 'fundraising' ? 'fundraising' : 'earnings';
      
      return {
        id: signal.id,
        title: signal.summary,
        source: '', // signals don't have source directly; could use content source but not needed for now
        sourceUrl: '',
        category: category as Deal['category'],
        companies: signal.companies.slice(0, 3),
        publishedAt: signal.published_at,
        url: signal.url,
      };
    });
  }, [signals]);`
);

fs.writeFileSync('src/components/SignalPanel.tsx', content);
console.log('Fixed TimeAgo and deals memo');
