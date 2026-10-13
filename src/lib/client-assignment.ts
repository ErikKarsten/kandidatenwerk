import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { SAMPLE_TAG } from "@/lib/candidate-tags"

type Supabase = SupabaseClient<Database>

// Kanzleien sehen nur vorqualifizierte Kandidaten (Paket 19, T-86): Zuordnen geht nur mit
// Status "vorqualifiziert" (Beispiel-Leads ausgenommen).
export const ASSIGNABLE_STATUS = "vorqualifiziert"
export const NOT_ASSIGNABLE_MESSAGE = "Nur vorqualifizierte Kandidaten können einer Kanzlei zugeordnet werden."
// Musterdatensätze (Paket 62) sind nur zum Vorführen da und nie einer Kanzlei zuordenbar.
export const SAMPLE_NOT_ASSIGNABLE_MESSAGE = "Musterdatensätze können keiner Kanzlei zugeordnet werden."

export function isSampleCandidate(tags: string[] | null | undefined): boolean {
  return (tags ?? []).includes(SAMPLE_TAG)
}

// null = zuordenbar, sonst die Fehlermeldung.
async function assignabilityError(supabase: Supabase, candidateId: string): Promise<string | null> {
  const { data } = await supabase.from("candidates").select("status, is_demo, tags").eq("id", candidateId).maybeSingle()
  if (!data) return NOT_ASSIGNABLE_MESSAGE
  if (isSampleCandidate(data.tags)) return SAMPLE_NOT_ASSIGNABLE_MESSAGE
  return data.is_demo || data.status === ASSIGNABLE_STATUS ? null : NOT_ASSIGNABLE_MESSAGE
}

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
  const notAssignable = await assignabilityError(supabase, candidateId)
  if (notAssignable) throw new Error(notAssignable)
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

// Zuordnung eines Kandidaten zu einer KANZLEI-KAMPAGNE (Atlas T-36): idempotent je
// (Kandidat, Kampagne), höchstens eine aktive Zuordnung je Kanzlei (Paket 31). client_id wird aus der Kampagne übernommen - der DB-Trigger
// client_assignments_sync_campaign erzwingt das zusätzlich und lehnt Lead-Kampagnen ab.
// Gibt die ID der (bestehenden oder neuen) Zuordnung zurück und ob sie neu ist.
export async function ensureCampaignAssignment(
  supabase: Supabase,
  candidateId: string,
  campaignId: string,
  createdBy?: string | null
): Promise<{ id: string; created: boolean }> {
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("client_id, kind")
    .eq("id", campaignId)
    .maybeSingle()
  if (campaignError) throw new Error(campaignError.message)
  if (!campaign) throw new Error("Kampagne nicht gefunden.")
  if (campaign.kind !== "kanzlei" || !campaign.client_id) {
    throw new Error("Kandidaten können nur Kanzlei-Kampagnen zugeordnet werden.")
  }
  const notAssignable = await assignabilityError(supabase, candidateId)
  if (notAssignable) throw new Error(notAssignable)

  // Eine aktive Zuordnung je Kandidat und Kanzlei (Paket 31, Unique-Index): über dieselbe
  // Kampagne idempotent, über eine andere Kampagne derselben Kanzlei ein klarer Hinweis.
  const { data: existing, error: lookupError } = await supabase
    .from("client_assignments")
    .select("id, campaign_id, campaigns(title)")
    .eq("candidate_id", candidateId)
    .eq("client_id", campaign.client_id)
    .is("removed_at", null)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (existing && existing.campaign_id === campaignId) return { id: existing.id, created: false }
  if (existing) {
    const rel = existing.campaigns as { title: string } | { title: string }[] | null
    const title = (Array.isArray(rel) ? rel[0]?.title : rel?.title) ?? "ohne Kampagne"
    throw new Error(`Der Kandidat ist dieser Kanzlei bereits zugeordnet (Kampagne „${title}“).`)
  }

  const { data: inserted, error: insertError } = await supabase
    .from("client_assignments")
    .insert({
      candidate_id: candidateId,
      campaign_id: campaignId,
      client_id: campaign.client_id,
      created_by: createdBy ?? null,
    })
    .select("id")
    .single()
  if (insertError) throw new Error(insertError.message)
  return { id: inserted.id, created: true }
}
