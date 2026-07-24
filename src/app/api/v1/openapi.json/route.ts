import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Path relative to this route file
    const specPath = join(
      process.cwd(),
      "public/api/v1/openapi.json"
    );
    const content = await readFile(specPath, "utf-8");
    const spec = JSON.parse(content); // validate JSON

    return NextResponse.json(spec, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=600",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "OpenAPI spec not available" },
      { status: 500 }
    );
  }
}