// Automatisierungen sofort beim Ereignis auslösen (Paket 22): Zuordnung, Statuswechsel,
// neuer Lead. Läuft per after() nach der Antwort, nur für die betroffenen Kampagnen und mit
// Server-Rechten. Der 5-Minuten-Job bleibt als Absicherung (doppelter Versand ist durch
// die Reservierung in campaign_automation_runs ausgeschlossen).
import { after } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { runAutomations } from "@/lib/cron/run-automations"

export function triggerAutomationsNow(campaignIds: (string | null | undefined)[]): void {
  const ids = [...new Set(campaignIds.filter((id): id is string => !!id))]
  if (ids.length === 0) return
  const run = async () => {
    try {
      await runAutomations(createSupabaseAdminClient(), { campaignIds: ids, immediate: true, log: () => {} })
    } catch (err) {
      console.error("[automationen] Sofort-Auslösung fehlgeschlagen:", err instanceof Error ? err.message : err)
    }
  }
  try {
    after(run)
  } catch {
    // Außerhalb einer Anfrage (z.B. CLI-Skript) gibt es kein after() - dann übernimmt der
    // 5-Minuten-Job.
  }
}
