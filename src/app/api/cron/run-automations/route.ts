import { NextResponse, type NextRequest } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runAutomations } from "@/lib/cron/run-automations"

// Aufgerufen vom Cloudflare Cron Trigger (custom-worker.ts, alle 5 Minuten).
// ?dryRun=1: zeigt nur, was verschickt würde (kein Versand, kein DB-Schreiben) - zum
// gefahrlosen Prüfen des Endpunkts.
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = request.headers.get("x-cron-secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1"
  const result = await runAutomations(createSupabaseAdminClient(), { dryRun })

  if (dryRun) return NextResponse.json({ dryRun: true, wouldSend: result.sent, wouldSkip: result.skipped, errors: result.errors })

  return NextResponse.json(result)
}
