import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { pollRecentActivities, processPendingActivities } from "@/lib/close-sync"
import { processOnboarding } from "@/lib/close-onboarding"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten): Übernahme neuer
// Kunden aus Close (close-onboarding.ts) und Close-Aktivitäten als Kommentar beim Kunden
// (close-sync.ts, Telefonate mit Transkription). Arbeitet höchstens 4 Minuten, damit sich
// Läufe nicht überschneiden.
const RUN_BUDGET_MS = 4 * 60_000 + 20_000
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob(supabase, "close-meetings", async () => {
    const db = supabase as unknown as SupabaseClient
    const deadline = Date.now() + RUN_BUDGET_MS
    // Übernahme starten (Kunde anlegen, Verlauf holen), Aktivitäten verarbeiten (Telefonate
    // parallel), danach Übernahme abschließen (Profil) - meist alles im selben Lauf.
    const started = await processOnboarding(db, deadline)
    const polled = await pollRecentActivities(db)
    const r = await processPendingActivities(db, deadline)
    const finished = await processOnboarding(db, deadline)
    const onboarding = { steps: started.steps + finished.steps, failed: started.failed + finished.failed }
    // errors: je endgültig gescheiterte Aktivität/Übernahme eine Zeile mit Kunde und Close-Link
    // (Fehlermeldung, describeCronFailure). Vorübergehende Fehler (retrying) melden nicht.
    const errors = [...r.errors, ...started.errors, ...finished.errors]
    return { result: { ...r, errors, polled, onboarding }, ok: r.failed === 0 && onboarding.failed === 0 }
  })
  return NextResponse.json(result)
}
