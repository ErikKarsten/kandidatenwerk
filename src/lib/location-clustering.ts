import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

const PLZ_PREFIX_LENGTH = 3

// Ordnet eine PLZ ihrem 3-stelligen PLZ-Bereich (locations) zu und legt den Bereich bei
// Bedarf neu an - Grundlage für das PLZ-Bereich-Clustering im geplanten Standort-Feature.
// Gibt null statt eines Fehlers zurück, wenn die PLZ fehlt, kürzer als 3 Zeichen oder
// keine gültige dreistellige Zahl ist (gleiches "kein Fehlerfall"-Muster wie
// geocode-plz.ts) - Aufrufer können location_id dann einfach auf null setzen.
export async function getOrCreateLocationForPlz(
  supabase: Supabase,
  plz: string | null | undefined
): Promise<string | null> {
  if (!plz) return null

  const prefix = plz.trim().slice(0, PLZ_PREFIX_LENGTH)
  if (!/^\d{3}$/.test(prefix)) return null

  const { data: existing, error: selectError } = await supabase
    .from("locations")
    .select("id")
    .eq("plz_prefix", prefix)
    .maybeSingle()

  if (selectError) throw new Error(selectError.message)
  if (existing) return existing.id

  const { data: created, error: insertError } = await supabase
    .from("locations")
    .insert({ plz_prefix: prefix })
    .select("id")
    .single()

  if (insertError) {
    // Race condition: zwei gleichzeitige Aufrufe für denselben Präfix - der UNIQUE-
    // Constraint auf plz_prefix lässt nur einen Insert durchkommen. In dem Fall
    // existiert die location inzwischen bereits, also einfach nachladen statt zu werfen.
    const { data: fallback, error: fallbackError } = await supabase
      .from("locations")
      .select("id")
      .eq("plz_prefix", prefix)
      .maybeSingle()

    if (fallbackError || !fallback) throw new Error(insertError.message)
    return fallback.id
  }

  return created.id
}
