const { execSync } = require('child_process');
const http = require('http');

console.log('Starting dev server in background...');
const child = execSync('npm run dev &', { cwd: __dirname, stdio: 'ignore', detached: true });
console.log('Waiting for server to start...');
setTimeout(() => {
  http.get('http://localhost:3000/api/v1/signals', (resp) => {
    let data = '';
    resp.on('data', (chunk) => data += chunk);
    resp.on('end', () => {
      console.log('Status:', resp.statusCode);
      console.log('Response:', data.substring(0, 200));
      try {
        const parsed = JSON.parse(data);
        console.log('Signal count:', parsed.count);
        console.log('Signals length:', parsed.signals.length);
        if (parsed.signals.length > 0) {
          console.log('First signal summary:', parsed.signals[0].summary);
          console.log('First signal companies:', parsed.signals[0].companies);
          console.log('First signal created_at:', parsed.signals[0].created_at);
        }
      } catch (e) {
        console.error('Parse error:', e.message);
      }
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('Request error:', err.message);
    process.exit(1);
  });
}, 8000);
