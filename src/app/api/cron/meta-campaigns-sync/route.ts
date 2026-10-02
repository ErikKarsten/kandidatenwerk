import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { syncMetaCampaigns } from "@/lib/meta-campaigns-sync"
import { runTrackedCronJob } from "@/lib/cron/job-runs"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, stündlich).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-campaigns-sync", async () => {
    const r = await syncMetaCampaigns(supabase)
    return { result: r, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
