import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { settingBdaAbarbeiten } from "@/lib/setting-bda"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten): "Setting BDA" in
// Close aus dem Quali-Gespräch füllen (Paket 113, src/lib/setting-bda.ts).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "setting-bda", async () => {
    const r = await settingBdaAbarbeiten()
    return { result: r, ok: r.fehler.length === 0 }
  })
  return NextResponse.json(result)
}
