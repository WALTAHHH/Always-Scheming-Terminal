import { NextResponse } from "next/server";

// Build marker — increment to verify deployment: v6
export async function GET() {
  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), build: "v6" });
}
