import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { syncMetaLeads } from "@/lib/cron/meta-leads-sync"
import { runTrackedCronJob } from "@/lib/cron/job-runs"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 30 Minuten).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-leads-sync", async () => {
    // Nur die letzten 3 Tage: Echtzeit kommt über den Webhook, der Cron ist das Netz für
    // verpasste Events. Ältere Leads per CLI (scripts/meta-leads-sync.ts).
    const r = await syncMetaLeads(supabase, { sinceDays: 3 })
    return { result: r, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
