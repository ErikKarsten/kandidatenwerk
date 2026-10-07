import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runAutomations } from "@/lib/cron/run-automations"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { sendLeadConfirmations } from "@/lib/lead-confirmation"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten).
// ?dryRun=1: zeigt nur, was verschickt würde (kein Versand, kein DB-Schreiben) - zum
// gefahrlosen Prüfen des Endpunkts.
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1"
  if (dryRun) {
    const result = await runAutomations(supabase, { dryRun })
    return NextResponse.json({ dryRun: true, wouldSend: result.sent, wouldSkip: result.skipped, errors: result.errors })
  }

  const result = await runTrackedCronJob(supabase, "run-automations", async () => {
    const r = await runAutomations(supabase)
    // Zentrale Eingangsbestätigung (Paket 23) - Absicherung für Leads aus dem Sammelabgleich.
    const confirmations = await sendLeadConfirmations(supabase)
    return { result: { ...r, confirmations }, ok: r.errors === 0 && confirmations.failed === 0 }
  })

  return NextResponse.json(result)
}
