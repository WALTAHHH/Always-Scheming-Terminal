import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { extractSignal } from './signal-extractor';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function run() {
  const { data } = await sb.from('content')
    .select('id, title, body, tags, sources!inner(source_type)')
    .limit(500) as any;

  const eligible = (data || []).filter((i: any) => {
    const t = i.tags || {};
    return t.company?.length > 0 && t.category?.length > 0;
  });

  console.log('Extracting signals for', eligible.length, 'eligible articles...');

  for (const item of eligible) {
    await extractSignal({
      supabase: sb,
      item: {
        id: item.id,
        title: item.title,
        body: item.body,
        tags: item.tags,
        sources: { source_type: item.sources.source_type },
      },
      hasResolvedEntity: true,
    });
    process.stdout.write('.');
  }

  const { count } = await sb.from('signals').select('*', { count: 'exact', head: true });
  console.log('\nDone. Signals in DB:', count);
}

run().catch(console.error);
