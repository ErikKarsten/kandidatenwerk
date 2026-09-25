// Zugriff auf die agenturweit gepflegte Zusatzfelder-Liste (custom_field_definitions)
// und die Prüfliste für unbekannte Antwortschlüssel (custom_field_review_queue) - für
// die Leadtable-/Meta-Extraktion (Schritt 3/3 des Umbaus vom 25.09.2026, siehe
// candidate-custom-fields.ts für den bisherigen fest-codierten Stand). Bewusst OHNE
// eigene Supabase-Client-Erzeugung - der Aufrufer übergibt seinen (RLS-gebunden oder
// Service-Role, je nach Kontext), gleiches Muster wie leadtable-sync-shared.ts.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

export interface CustomFieldDefinitionLite {
  key: string
  label: string
}

export async function getActiveCustomFieldDefinitionsForAgency(
  supabase: Supabase,
  agencyId: string
): Promise<CustomFieldDefinitionLite[]> {
  const { data, error } = await supabase
    .from("custom_field_definitions")
    .select("key, label")
    .eq("agency_id", agencyId)
    .eq("active", true)
    .order("sort_order", { ascending: true })
  if (error) throw new Error(error.message)
  return data ?? []
}

// Cache-Fabrik für Skripte/Sync-Läufe, die viele Kandidaten/Kampagnen desselben Kunden
// bzw. derselben Agentur nacheinander verarbeiten (leadtable-full-sync.ts,
// leadtable-custom-fields-ai-resync.ts, leadtable-backfill-fields.ts, processMetaLead) -
// vermeidet identische client_id->agency_id- und agency_id->Felderliste-Anfragen pro
// Kandidat. Liefert [] zurück, wenn clientId null ist oder kein Kunde mit dieser ID
// gefunden wird (kein Werfen - Aufrufer sollen dadurch nicht abbrechen).
export function createCustomFieldDefinitionsCache(supabase: Supabase) {
  const agencyIdByClientId = new Map<string, string | null>()
  const fieldsByAgencyId = new Map<string, CustomFieldDefinitionLite[]>()

  return async function getForClient(clientId: string | null): Promise<CustomFieldDefinitionLite[]> {
    if (!clientId) return []

    let agencyId = agencyIdByClientId.get(clientId)
    if (agencyId === undefined) {
      const { data } = await supabase.from("clients").select("agency_id").eq("id", clientId).maybeSingle()
      agencyId = data?.agency_id ?? null
      agencyIdByClientId.set(clientId, agencyId)
    }
    if (!agencyId) return []

    let fields = fieldsByAgencyId.get(agencyId)
    if (!fields) {
      fields = await getActiveCustomFieldDefinitionsForAgency(supabase, agencyId)
      fieldsByAgencyId.set(agencyId, fields)
    }
    return fields
  }
}

export interface UnmappedAnswer {
  rawKey: string
  value: string
}

// Trägt unbekannte Antwortschlüssel (Leadtable-Formularfragen ohne Zuordnung zu einem
// bestehenden Feld, oder unbekannte Meta-Feld-Keys) in custom_field_review_queue ein -
// ein Eintrag pro (agency_id, raw_key), Trefferzahl/Beispielwert werden bei erneutem
// Auftreten aktualisiert. Ein bereits von einem Menschen geprüfter Status (dismissed/
// mapped) wird NICHT zurückgesetzt - nur occurrences/example_value/last_seen_at ändern
// sich, siehe Migration 20260925000000_dynamic_custom_field_definitions.sql, Punkt 3
// der Anfrage vom 25.09.2026 (kein automatisches Anlegen neuer Felder).
export async function recordUnmappedAnswerKeys(
  supabase: Supabase,
  agencyId: string,
  candidateId: string,
  unmapped: UnmappedAnswer[]
): Promise<void> {
  for (const { rawKey, value } of unmapped) {
    const { data: existing } = await supabase
      .from("custom_field_review_queue")
      .select("id, occurrences")
      .eq("agency_id", agencyId)
      .eq("raw_key", rawKey)
      .maybeSingle()

    if (existing) {
      await supabase
        .from("custom_field_review_queue")
        .update({
          occurrences: existing.occurrences + 1,
          example_value: value,
          example_candidate_id: candidateId,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
    } else {
      await supabase.from("custom_field_review_queue").insert({
        agency_id: agencyId,
        raw_key: rawKey,
        example_value: value,
        example_candidate_id: candidateId,
        occurrences: 1,
      })
    }
  }
}
