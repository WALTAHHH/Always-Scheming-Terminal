require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Querying signals with investment_relevance_score >= 0.5...');
  const { data, error } = await supabase
    .from('signals')
    .select('signal_type, investment_relevance_score')
    .gte('investment_relevance_score', 0.5)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Supabase error:', error);
    return;
  }

  console.log(`Total signals meeting threshold: ${data.length}`);
  
  const byType = {};
  data.forEach(s => {
    byType[s.signal_type] = (byType[s.signal_type] || 0) + 1;
  });

  console.log('\nSignal type breakdown:');
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  const dealTypes = ['fundraising', 'acquisition', 'earnings'];
  const dealCount = data.filter(s => dealTypes.includes(s.signal_type)).length;
  console.log(`\nDeal signals (${dealTypes.join(', ')}): ${dealCount}`);
  if (dealCount === 0) {
    console.log('WARNING: No deal signals in database. This may be expected if no fundraising/acquisition/earnings signals extracted yet.');
  }

  // Check total signals available
  const { count } = await supabase
    .from('signals')
    .select('*', { count: 'exact', head: true });
  console.log(`\nTotal signals in table: ${count}`);
}

run().catch(console.error);
