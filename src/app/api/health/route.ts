import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

// Öffentlicher Health-Check für die Überwachung (T-105, z.B. Better Stack/UptimeRobot alle
// 5 Minuten): 200 = alles in Ordnung, 503 = Datenbank nicht erreichbar oder der
// 5-Minuten-Cronjob run-automations ist seit über 20 Minuten nicht gelaufen (Cron-Trigger
// ausgefallen - dafür gibt es sonst keinen Alarm, weil gar kein Lauf scheitert).
// Bewusst ohne Inhalte: nur Ja/Nein je Prüfung.
export const dynamic = "force-dynamic"

const CRON_STALE_MINUTES = 20

export async function GET() {
  const checks: Record<string, boolean> = { database: false, cron: false }
  try {
    const db = createSupabaseAdminClient() as unknown as SupabaseClient
    const { data, error } = await db
      .from("cron_job_runs")
      .select("started_at")
      .eq("job", "run-automations")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    checks.database = !error
    const last = data?.started_at ? new Date(data.started_at as string).getTime() : 0
    checks.cron = Date.now() - last < CRON_STALE_MINUTES * 60e3
  } catch {
    // Datenbank nicht erreichbar - beide Prüfungen bleiben false.
  }
  const ok = Object.values(checks).every(Boolean)
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } })
}
