import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { processPendingMeetings } from "@/lib/close-meetings"
import { runTrackedCronJob } from "@/lib/cron/job-runs"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten): fasst
// vorgemerkte Close-Besprechungen zusammen und legt sie als Kommentar beim Kunden an.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "close-meetings", async () => {
    const r = await processPendingMeetings(supabase as unknown as SupabaseClient)
    return { result: r, ok: r.failed === 0 }
  })
  return NextResponse.json(result)
}
