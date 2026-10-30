import { createServerClient } from "@/lib/supabase";
import type { FeedItem } from "@/lib/database.types";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max).trimEnd() + "…";
}

export async function GET() {
  const supabase = createServerClient();

  const { data, error } = (await supabase
    .from("content")
    .select("*, sources!inner(name, url, source_type, active), signals(summary, signal_type, investment_relevance_score)")
    .eq("sources.active" as string, true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50)) as unknown as { data: FeedItem[] | null; error: { message: string } | null };

  if (error) {
    return new Response(`<error>${escapeXml(error.message)}</error>`, {
      status: 500,
      headers: { "Content-Type": "application/xml" },
    });
  }

  const items = data || [];
  const now = new Date().toUTCString();

  const itemsXml = items
    .map((item) => {
      const source = Array.isArray(item.sources) ? item.sources[0] : item.sources;
      const sourceName = source?.name ?? "Unknown";
      const title = item.title ? escapeXml(item.title) : "Untitled";
      const link = item.url ? escapeXml(item.url) : "";

      // Pick best description: body → signal summary → empty
      const signalData = Array.isArray(item.signals) ? item.signals[0] : item.signals;
      const descriptionText = item.body
        ? truncate(item.body, 500)
        : signalData?.summary
        ? signalData.summary
        : "";
      const description = descriptionText ? escapeXml(descriptionText) : "";

      const pubDate = item.published_at
        ? new Date(item.published_at).toUTCString()
        : now;

      const categoryTags = signalData
        ? `\n      <category>${escapeXml(signalData.signal_type)}</category>`
        : "";

      return `    <item>\n      <title>${title}</title>\n      <link>${link}</link>\n      <description>${description}</description>${categoryTags}\n      <pubDate>${pubDate}</pubDate>\n      <guid isPermaLink="false">${item.id}</guid>\n      <dc:creator>${escapeXml(sourceName)}</dc:creator>\n    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Always Scheming | Terminal</title>
    <link>https://alwaysscheming.com</link>
    <description>Gaming industry intelligence, real-time.</description>
    <language>en-us</language>
    <lastBuildDate>${now}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
