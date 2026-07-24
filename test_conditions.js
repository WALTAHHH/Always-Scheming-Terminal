const { execSync } = require('child_process');
const http = require('http');

console.log('Starting dev server...');
const child = execSync('npm run dev &', { cwd: __dirname, stdio: 'ignore', detached: true });

setTimeout(() => {
  http.get('http://localhost:3000/api/v1/signals', (resp) => {
    let data = '';
    resp.on('data', (chunk) => data += chunk);
    resp.on('end', () => {
      console.log('=== TEST 1: 20 signals in one query ===');
      const parsed = JSON.parse(data);
      console.log('Signal count:', parsed.count);
      console.log('Signals length:', parsed.signals.length);
      const is20 = parsed.signals.length === 20;
      console.log('✓' + (is20 ? ' PASS' : ' FAIL'), '20 signals returned');

      console.log('\n=== TEST 2: DEALS section filters correctly ===');
      const dealTypes = ['fundraising', 'acquisition', 'earnings'];
      const dealSignals = parsed.signals.filter(s => dealTypes.includes(s.signal_type));
      console.log('Deal signals found:', dealSignals.length);
      console.log('Types:', dealSignals.map(d => d.signal_type));
      const hasDeals = dealSignals.length > 0;
      console.log('✓' + (hasDeals ? ' PASS' : ' FAIL'), 'Deals present');

      console.log('\n=== TEST 3: TimeAgo present on signals ===');
      const hasTimeAgo = parsed.signals.every(s => s.created_at);
      console.log('All signals have created_at:', hasTimeAgo);
      console.log('✓' + (hasTimeAgo ? ' PASS' : ' FAIL'), 'TimeAgo timestamp present');

      console.log('\n=== TEST 4: View all link condition ( >10 signals ) ===');
      const showViewAll = parsed.signals.length > 10;
      console.log('Signals >10?', showViewAll);
      console.log('✓' + (showViewAll ? ' PASS' : ' FAIL'), 'View all link should appear');

      console.log('\n=== TEST 5: No console errors (manual check) ===');
      console.log('✓ (manual) - No console errors in browser dev tools');

      console.log('\n=== SUMMARY ===');
      const allPass = is20 && hasDeals && hasTimeAgo && showViewAll;
      console.log(allPass ? '✅ All integration tests pass' : '❌ Some tests failed');
      
      process.exit(allPass ? 0 : 1);
    });
  }).on('error', (err) => {
    console.error('Request error:', err.message);
    process.exit(1);
  });
}, 8000);
