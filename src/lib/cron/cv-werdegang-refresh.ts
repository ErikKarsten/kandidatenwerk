// Werdegang für den Lebenslauf im Hintergrund aktualisieren (Paket 83): Wer die Stationen in
// die Beschreibung schreibt, soll beim Öffnen des Lebenslaufs nicht erst eine Minute warten
// (und die Erstellung ging verloren, wenn man die Seite vorher schloss). Alle 5 Minuten:
// kürzlich geänderte Kandidaten, deren Angaben sich seit dem letzten Werdegang geändert haben
// - mit vorhandenem Werdegang oder mit Stationen in der Beschreibung (Jahresangaben).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { generateWerdegang, werdegangInputHash } from "@/lib/cv-werdegang"
import { SAMPLE_TAG } from "@/lib/candidate-tags"

const WINDOW_MS = 20 * 60_000

// "2016 - 2021", "05/2022 – aktuell", "seit 2019" …
export function mentionsStations(notes: string | null | undefined): boolean {
  return /\b(19|20)\d{2}\s*[-–]\s*(\d{2}\/)?((19|20)\d{2}|heute|aktuell|jetzt)\b|\bseit\s+(\d{2}\/)?(19|20)\d{2}\b/i.test(notes ?? "")
}

export interface CvRefreshResult {
  checked: number
  refreshed: number
  errors: string[]
}

export async function refreshCvWerdegaenge(
  db: SupabaseClient<Database>,
  { deadline, now = Date.now() }: { deadline: number; now?: number }
): Promise<CvRefreshResult> {
  const result: CvRefreshResult = { checked: 0, refreshed: 0, errors: [] }
  const { data, error } = await db
    .from("candidates")
    .select("id, berufsbild, custom_fields, notes, tags, cv_werdegang, cv_werdegang_input")
    .eq("is_demo", false)
    .gte("updated_at", new Date(now - WINDOW_MS).toISOString())
    .order("updated_at", { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  for (const c of data ?? []) {
    if ((c.tags ?? []).includes(SAMPLE_TAG)) continue
    result.checked++
    const input = { ...c, custom_fields: (c.custom_fields ?? {}) as Record<string, unknown> }
    if (c.cv_werdegang_input === werdegangInputHash(input)) continue
    if (!c.cv_werdegang && !mentionsStations(c.notes)) continue
    // Etwa eine Minute je Werdegang - nur anfangen, wenn genug Zeit bleibt.
    if (Date.now() > deadline - 75_000) break
    try {
      await generateWerdegang(db, c.id)
      result.refreshed++
    } catch (err) {
      result.errors.push(`${c.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return result
}
