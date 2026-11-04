import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runMatchingCron } from "@/lib/cron/matching-digest"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, jede volle Stunde): Matching-
// Vorschläge abgleichen, Mo + Do morgens die Sammel-Mail (Paket 96).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "matching", async () => {
    const r = await runMatchingCron(supabase)
    return { result: r, ok: r.errors === 0 }
  })

  return NextResponse.json(result)
}
