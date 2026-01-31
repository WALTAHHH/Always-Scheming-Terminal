import { createServerClient } from "@/lib/supabase";
import { Feed } from "@/components/Feed";
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
    .limit(100);

  if (error) {
    console.error("Failed to fetch items:", error.message);
    return [];
  }

  return (data as FeedItem[]) ?? [];
}

export default async function Home() {
  const items = await getItems();

  return (
    <main className="min-h-screen">
      <Header />
      <div className="max-w-5xl mx-auto px-4 py-4">
        {items.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-ast-muted text-lg">No items yet.</p>
            <p className="text-ast-muted text-sm mt-2">
              Run <code className="text-ast-accent">npm run ingest</code> or hit{" "}
              <code className="text-ast-accent">POST /api/ingest</code> to pull feeds.
            </p>
          </div>
        ) : (
          <Feed items={items} />
        )}
      </div>
    </main>
  );
}
