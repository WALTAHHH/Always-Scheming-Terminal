import { NextRequest, NextResponse } from "next/server";
import { ingestOne } from "@/lib/ingest";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source_id } = body;

  if (!source_id) {
    return NextResponse.json({ error: "source_id is required" }, { status: 400 });
  }

  try {
    const result = await ingestOne(source_id);

    return NextResponse.json({
      ok: result.errors.length === 0,
      result,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
