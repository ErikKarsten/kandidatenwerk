// Fehlermeldungen vom System (Paket 14, T-67): z.B. fehlgeschlagene Cronjobs laufen bei
// den Fehlermeldungen auf. Gleiche Fehler (source_key) werden zusammengefasst, solange
// der Eintrag offen ist - Zähler/letzter Zeitpunkt statt bei jedem Lauf ein neuer
// Eintrag. Erst wenn der Eintrag erledigt/abgelehnt ist, öffnet ein neuer Fehler wieder
// einen neuen Eintrag.
import type { SupabaseClient } from "@supabase/supabase-js"

const OPEN_STATUSES = ["neu", "in_pruefung", "freigegeben"]

export async function recordSystemReport(
  db: SupabaseClient,
  report: { sourceKey: string; title: string; description: string }
): Promise<{ created: boolean; id: string | null }> {
  const now = new Date().toISOString()
  const description = report.description.slice(0, 4000) || "(keine Details)"
  const { data: existing } = await db
    .from("bug_reports")
    .select("id, occurrences")
    .eq("source_key", report.sourceKey)
    .in("status", OPEN_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    await db
      .from("bug_reports")
      .update({ occurrences: (existing.occurrences as number) + 1, last_seen_at: now, description })
      .eq("id", existing.id)
    return { created: false, id: existing.id as string }
  }

  const { data: agency } = await db.from("agencies").select("id").limit(1).maybeSingle()
  const { data, error } = await db
    .from("bug_reports")
    .insert({
      agency_id: agency?.id ?? null,
      reporter_id: null,
      reporter_role: "system",
      source: "system",
      source_key: report.sourceKey,
      title: report.title.slice(0, 150),
      description,
      status: "neu",
      last_seen_at: now,
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  return { created: true, id: data.id as string }
}

// Kurzfassung eines Cron-Ergebnisses für die Fehlermeldung (Fehlertexte, gleiche
// zusammengefasst).
export function describeCronFailure(error: string | null, summary: unknown): string {
  if (error) return error
  const errors = (summary as { errors?: unknown[] } | null)?.errors ?? []
  if (errors.length === 0) return JSON.stringify(summary ?? {}).slice(0, 2000)
  const counts = new Map<string, number>()
  for (const e of errors) {
    const msg = typeof e === "string" ? e : String((e as { message?: string })?.message ?? JSON.stringify(e))
    const key = msg.replace(/\d{6,}/g, "…")
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts].map(([msg, n]) => `${n}× ${msg}`).join("\n")
}
