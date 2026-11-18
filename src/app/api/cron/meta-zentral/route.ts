import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { metaConfigured, runMetaZentral } from "@/lib/meta-zentral"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 30 Minuten): eine
// Meta-Anfrage für Konto-Prüfung und Werbezahlen (Paket 108, src/lib/meta-zentral.ts).
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Staging hat keinen Meta-Zugang - dann nicht als Fehler werten.
  if (!metaConfigured()) return NextResponse.json({ skipped: "Meta ist nicht eingerichtet." })

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "meta-zentral", async () => {
    // meta_* und push_abos sind noch nicht in src/types/database.ts generiert.
    const r = await runMetaZentral(supabase as unknown as SupabaseClient)
    return { result: r, ok: true }
  })

  return NextResponse.json(result)
}
