// Test Supabase query logic
const { createClient } = require('@supabase/supabase-js');

// Mock environment variables for test
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ekynojgesnxhjtblwbyq.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Build the query as in route.ts
const query = supabase
  .from('signals')
  .select(`
    id, signal_type, summary, investment_relevance_score, created_at,
    content:item_id (
      id, title, url, published_at,
      content_tags (value, dimension, entity_id)
    )
  `)
  .gte('investment_relevance_score', 0.5)
  .order('created_at', { ascending: false })
  .limit(20);

console.log('Generated query structure:');
console.log(query);
console.log('\nSQL-like representation:');
console.log('SELECT id, signal_type, summary, investment_relevance_score, created_at,');
console.log('       content.id, content.title, content.url, content.published_at,');
console.log('       content.content_tags.value, content.content_tags.dimension, content.content_tags.entity_id');
console.log('FROM signals');
console.log('LEFT JOIN content ON signals.item_id = content.id');
console.log('LEFT JOIN content_tags ON content.id = content_tags.content_id');
console.log('WHERE investment_relevance_score >= 0.5');
console.log('ORDER BY created_at DESC LIMIT 20');
