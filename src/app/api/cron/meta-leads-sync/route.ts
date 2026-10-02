import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { syncMetaLeads } from "@/lib/cron/meta-leads-sync"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 30 Minuten).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const result = await syncMetaLeads(createSupabaseAdminClient())

  return NextResponse.json(result)
}
