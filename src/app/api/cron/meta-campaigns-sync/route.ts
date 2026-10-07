import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { syncMetaCampaigns } from "@/lib/meta-campaigns-sync"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, stündlich).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-campaigns-sync", async () => {
    const r = await syncMetaCampaigns(supabase)
    return { result: r, ok: r.errors.length === 0 }
  })

  return NextResponse.json(result)
}
