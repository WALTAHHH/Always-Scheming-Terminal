import { createAuthServerClient } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createAuthServerClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check role in profiles table using service role client to bypass RLS
  const { createClient } = await import('@supabase/supabase-js');
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: profile } = await serviceClient
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { userId: session.user.id };
}
