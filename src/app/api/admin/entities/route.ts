import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAuthServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function GET(req: NextRequest) {
  // Auth check via session
  const supabase = await createAuthServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use service role client for queries
  const serviceClient = getServiceRoleClient();

  try {
    // 1. Fetch all entities
    console.log("Entities query block 1: fetch all entities");
    const { data: allEntities, error: entitiesError } = await serviceClient
      .from("entities")
      .select("id, canonical_name, entity_type, segment, ticker, is_public");

    if (entitiesError) {
      console.error("Entities query failed: fetch all entities", entitiesError);
      throw entitiesError;
    }

    if (!allEntities || allEntities.length === 0) {
      return NextResponse.json({
        entities: [],
        tagTimeSeries: [],
      });
    }

    const entityIds = allEntities.map(e => e.id);
    
    // 2. Fetch entity aliases
    console.log("Entities query block 2: fetch entity aliases");
    const { data: allAliases, error: aliasesError } = await serviceClient
      .from("entity_aliases")
      .select("entity_id");

    if (aliasesError) {
      console.error("Entities query failed: fetch entity aliases", aliasesError);
      throw aliasesError;
    }

    // Count aliases per entity
    const aliasCounts: Record<string, number> = {};
    (allAliases || []).forEach((row: { entity_id: string }) => {
      aliasCounts[row.entity_id] = (aliasCounts[row.entity_id] || 0) + 1;
    });

    // 3. Fetch content_tags for company dimension
    console.log("Entities query block 3: fetch content_tags (company)");
    const { data: companyTags, error: tagsError } = await serviceClient
      .from("content_tags")
      .select("entity_id")
      .eq("dimension", "company")
      .in("entity_id", entityIds.filter((id): id is string => !!id));

    if (tagsError) {
      console.error("Entities query failed: fetch content_tags", tagsError);
      throw tagsError;
    }

    // Count tags per entity - filter out null entity_id
    const tagCounts: Record<string, number> = {};
    (companyTags || []).forEach((row: { entity_id: string | null }) => {
      if (row.entity_id) {
        tagCounts[row.entity_id] = (tagCounts[row.entity_id] || 0) + 1;
      }
    });

    // 4. Fetch signals with entity_id if column exists
    console.log("Entities query block 4: fetch signals");
    let signalCounts: Record<string, number> = {};
    
    try {
      const { data: allSignals, error: signalsError } = await serviceClient
        .from("signals")
        .select("entity_id")
        .in("entity_id", entityIds.filter((id): id is string => !!id));

      if (!signalsError) {
        (allSignals || []).forEach((row: { entity_id: string | null }) => {
          if (row.entity_id) {
            signalCounts[row.entity_id] = (signalCounts[row.entity_id] || 0) + 1;
          }
        });
      } else {
        console.warn("Signals table may not have entity_id column:", signalsError.message);
      }
    } catch (err) {
      console.warn("Error fetching signals with entity_id:", err);
    }

    // 5. Create enriched entities array
    const entities = allEntities.map(entity => ({
      id: entity.id,
      canonical_name: entity.canonical_name,
      entity_type: entity.entity_type,
      segment: entity.segment,
      ticker: entity.ticker,
      is_public: entity.is_public,
      alias_count: aliasCounts[entity.id] || 0,
      tag_count: tagCounts[entity.id] || 0,
      signal_count: signalCounts[entity.id] || 0,
    }));

    // 6. Get top 8 entities by tag_count for time series
    const sortedByTagCount = [...entities]
      .sort((a, b) => b.tag_count - a.tag_count)
      .slice(0, 8);
    
    const topEntityIds = sortedByTagCount.map(e => e.id);

    // 7. Fetch time series data for top entities
    console.log("Entities query block 7: fetch time series data");

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    const { data: tagTimeSeriesRaw, error: tsError } = await serviceClient
      .from("content_tags")
      .select("entity_id, content_id, content(ingested_at)")
      .eq("dimension", "company")
      .in("entity_id", topEntityIds)
      .not("entity_id", "is", null)
      .gte("content.ingested_at", thirtyDaysAgo);

    if (tsError) {
      console.error("Entities query failed: fetch time series data", tsError);
      throw tsError;
    }

    // Group by entity and date
    const timeSeriesByEntity: Record<string, Record<string, number>> = {};
    
    (tagTimeSeriesRaw || []).forEach((row: any) => {
      const entityId = row.entity_id;
      if (!entityId) return;
      
      const ingestedAt = row.content?.ingested_at;
      if (!ingestedAt) return;
      
      const date = ingestedAt.split("T")[0];
      
      if (!timeSeriesByEntity[entityId]) {
        timeSeriesByEntity[entityId] = {};
      }
      
      timeSeriesByEntity[entityId][date] = (timeSeriesByEntity[entityId][date] || 0) + 1;
    });

    const tagTimeSeries = sortedByTagCount.map(entity => {
      const entityData = timeSeriesByEntity[entity.id] || {};
      const dates = Object.keys(entityData).sort();
      
      const data = dates.map(date => ({
        date,
        count: entityData[date] || 0,
      }));

      return {
        entity: entity.canonical_name,
        data,
      };
    });

    return NextResponse.json({
      entities,
      tagTimeSeries,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("Entities stats error:", msg, error);
    return NextResponse.json(
      { error: "Failed to fetch entities stats", detail: msg },
      { status: 500 }
    );
  }
}