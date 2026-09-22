import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

// Verknüpft einen Kandidaten mit einem Kunden im Portal (client_assignments), idempotent:
// legt nur an, wenn noch keine AKTIVE Zuordnung zu genau diesem Kunden besteht - sonst
// würden wiederholte Sync-/Import-Läufe die Zuordnungsliste unnötig aufblähen. Gleiche
// Dedup-Logik wie bisher schon in meta-leads-sync-shared.ts für den "bekannter Kandidat,
// bewirbt sich erneut bei einem weiteren Kunden"-Fall - jetzt zentralisiert und zusätzlich
// beim allerersten Anlegen eines Kandidaten genutzt, damit er direkt im Kunden-Portal
// sichtbar ist (vorher nur über den manuellen "Kanzlei zuordnen"-Button auf der
// Kandidaten-Detailseite).
export async function ensureClientAssignment(
  supabase: Supabase,
  candidateId: string,
  clientId: string
): Promise<void> {
  const { data: existing, error: lookupError } = await supabase
    .from("client_assignments")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("client_id", clientId)
    .is("removed_at", null)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)

  if (!existing) {
    const { error: insertError } = await supabase
      .from("client_assignments")
      .insert({ candidate_id: candidateId, client_id: clientId })
    if (insertError) throw new Error(insertError.message)
  }
}
