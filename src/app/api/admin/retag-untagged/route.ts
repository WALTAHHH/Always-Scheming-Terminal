import { requireAdmin } from '@/lib/admin-auth'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tagItemWithAI } from '@/lib/tagger'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: Request) {
  const isCron = req.headers.get('x-vercel-cron') === '1'

  if (!isCron) {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    // auth is { userId: string } – we don't need it for now
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Query untagged rows
  const { data: untagged, error: queryError } = await supabase
    .from('content')
    .select('id, title, body, tags')
    .or('tags->>company.is.null,tags->company.eq.[]')
    .order('published_at', { ascending: false })
    .limit(200)

  if (queryError) {
    console.error('Failed to query untagged content:', queryError)
    return NextResponse.json(
      { ok: false, error: 'Database query failed', details: queryError.message },
      { status: 500 }
    )
  }

  const processed = untagged.length
  let tagged = 0
  let errors = 0

  for (const item of untagged) {
    try {
      const aiTags = await tagItemWithAI(item.title, item.body)

      // Merge AI tags with existing tags (same pattern as applyAITagsAsync)
      const currentTags = item.tags as {
        category: string[]
        platform: string[]
        theme: string[]
        company: string[]
      } | null

      const baseTags = currentTags || {
        category: [],
        platform: [],
        theme: [],
        company: [],
      }

      const mergedTags = {
        category: baseTags.category,
        platform: baseTags.platform,
        theme: Array.from(new Set([...baseTags.theme, ...aiTags.theme])),
        company: Array.from(new Set([...baseTags.company, ...aiTags.company])),
      }

      // Update content.tags JSONB column
      const { error: contentUpdateError } = await supabase
        .from('content')
        .update({ tags: mergedTags })
        .eq('id', item.id)

      if (contentUpdateError) {
        console.error(`Failed to update content.tags for item ${item.id}:`, contentUpdateError)
        errors++
        continue
      }

      // Add new AI-discovered tags to content_tags (won't duplicate existing ones)
      const newTagRows: { content_id: string; dimension: string; value: string; manual: boolean }[] = []

      for (const theme of aiTags.theme) {
        if (!baseTags.theme.includes(theme)) {
          newTagRows.push({ content_id: item.id, dimension: 'theme', value: theme, manual: false })
        }
      }
      for (const company of aiTags.company) {
        if (!baseTags.company.includes(company)) {
          newTagRows.push({ content_id: item.id, dimension: 'company', value: company, manual: false })
        }
      }

      if (newTagRows.length > 0) {
        const { error: tagUpsertError } = await supabase
          .from('content_tags')
          .upsert(newTagRows, { onConflict: 'content_id,dimension,value', ignoreDuplicates: true })
        if (tagUpsertError) {
          console.error(`Failed to upsert content_tags for item ${item.id}:`, tagUpsertError)
          // Non-fatal; we still updated content.tags, so count as tagged
        }
      }

      tagged++
    } catch (err) {
      console.error(`Failed to tag item ${item.id}:`, err)
      errors++
    }
  }

  // Count remaining untagged after this batch
  const { count: remaining, error: countError } = await supabase
    .from('content')
    .select('*', { count: 'exact', head: true })
    .or('tags->>company.is.null,tags->company.eq.[]')

  if (countError) {
    console.error('Failed to count remaining untagged:', countError)
  }

  // Self-chain if remaining > 0
  if (remaining && remaining > 0) {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    fetch(`${baseUrl}/api/admin/retag-untagged`, {
      method: 'POST',
      headers: { 'x-vercel-cron': '1' },
    }).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    summary: {
      processed,
      tagged,
      errors,
      remaining: remaining || 0,
    },
  })
}