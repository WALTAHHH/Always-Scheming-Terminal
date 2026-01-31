import { createServerClient } from "@/lib/supabase";
import { LiveFeed } from "@/components/LiveFeed";
import { Header } from "@/components/Header";
import type { FeedItem } from "@/lib/database.types";

export const dynamic = "force-dynamic"; // Always fetch fresh from Supabase

async function getItems(): Promise<FeedItem[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("items")
    .select("*, sources(name, url, source_type)")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(500);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    return [];
  }

  return (data as FeedItem[]) ?? [];
}

async function getSources(): Promise<{ name: string }[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return [];
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from("sources")
    .select("name")
    .eq("active", true)
    .order("name");

  return data ?? [];
}

export default async function Home() {
  const [items, sources] = await Promise.all([getItems(), getSources()]);

  return (
    <main className="min-h-screen">
      <Header />
      {items.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-ast-muted text-lg">No items yet.</p>
          <p className="text-ast-muted text-sm mt-2">
            Run <code className="text-ast-accent">npm run ingest</code> or hit{" "}
            <code className="text-ast-accent">POST /api/ingest</code> to pull feeds.
          </p>
        </div>
      ) : (
        <LiveFeed initialItems={items} sources={sources} />
      )}
    </main>
  );
}
