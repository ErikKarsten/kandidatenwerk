import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { metaConfigured } from "@/lib/meta-zentral"
import { syncMetaAnzeigen } from "@/lib/meta-anzeigen"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, täglich 06:00 UTC): Texte,
// Bilder und KI-Einschätzung der Anzeigen für das Meta-Analyse-Tool (Paket 108).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!metaConfigured()) return NextResponse.json({ skipped: "Meta ist nicht eingerichtet." })

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-anzeigen", async () => {
    const r = await syncMetaAnzeigen(supabase as unknown as SupabaseClient)
    return { result: r, ok: true }
  })
  return NextResponse.json(result)
}
