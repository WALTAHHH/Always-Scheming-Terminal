const fs = require('fs');
let content = fs.readFileSync('src/components/SignalPanel.tsx', 'utf8');
const newDealsMemo = `  // Compute deals (Fundraising, M&A, Earnings) from signals table
  const deals = useMemo<Deal[]>(() => {
    const dealSignals = signals.filter(s =>
      ['fundraising', 'acquisition', 'earnings'].includes(s.signal_type)
    );
    // Sort by created_at descending
    dealSignals.sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
    // Map to Deal interface
    return dealSignals.slice(0, 5).map((signal) => {
      const category = signal.signal_type === 'acquisition' ? 'm-and-a' : 
                      signal.signal_type === 'fundraising' ? 'fundraising' : 'earnings';
      return {
        id: signal.id,
        title: signal.summary,
        source: 'Signal',
        sourceUrl: '',
        category: category as Deal['category'],
        companies: signal.companies.slice(0, 3),
        publishedAt: signal.published_at,
        url: signal.url,
      };
    });
  }, [signals]);`;
// Replace the old deals memo block (from line start with // Compute deals ... up to the next line that matches '}, [signals]);')
const lines = content.split('\n');
let start = -1, end = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('// Compute deals (Fundraising, M&A, Earnings) from signals table')) {
    start = i;
    break;
  }
}
if (start !== -1) {
  for (let i = start; i < lines.length; i++) {
    if (lines[i].includes('}, [signals]);')) {
      end = i;
      break;
    }
  }
}
if (start !== -1 && end !== -1) {
  lines.splice(start, end - start + 1, newDealsMemo);
  fs.writeFileSync('src/components/SignalPanel.tsx', lines.join('\n'));
  console.log('Replaced deals memo');
} else {
  console.error('Could not locate deals memo block');
}
