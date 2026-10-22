import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { refreshCvWerdegaenge } from "@/lib/cron/cv-werdegang-refresh"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten nach den
// Automatisierungen): Werdegang für den Lebenslauf im Hintergrund aktualisieren (Paket 83).
// Höchstens 3 Minuten je Lauf, der Rest folgt im nächsten.
const RUN_BUDGET_MS = 3 * 60_000

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "cv-werdegang", async () => {
    const r = await refreshCvWerdegaenge(supabase, { deadline: Date.now() + RUN_BUDGET_MS })
    return { result: r, ok: r.errors.length === 0 }
  })
  return NextResponse.json(result)
}
