import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runSampleFeed, sampleFeedEnabled, type SampleFeedResult } from "@/lib/sample-feed"
import { runTrackedCronJob } from "@/lib/cron/job-runs"
import { isCronAuthorized } from "@/lib/cron-auth"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, stündlich): Beispielkandidaten
// für Live-Kunden (Paket 76). Höchstens gut 4 Minuten je Lauf - neu erzeugte Datensätze
// brauchen die KI, der Rest folgt im nächsten Lauf.
const RUN_BUDGET_MS = 4 * 60_000 + 20_000

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createSupabaseAdminClient()
  const result = await runTrackedCronJob<SampleFeedResult | { paused: true }>(supabase, "sample-feed", async () => {
    // Pausiert: nur protokollieren (für die Cron-Überwachung), nichts zuordnen.
    if (!sampleFeedEnabled()) return { result: { paused: true as const }, ok: true }
    const r = await runSampleFeed(supabase as unknown as SupabaseClient, { deadline: Date.now() + RUN_BUDGET_MS })
    return { result: r, ok: r.errors.length === 0 }
  })
  return NextResponse.json(result)
}
