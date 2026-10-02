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

// Zuordnung eines Kandidaten zu einer KANZLEI-KAMPAGNE (Atlas T-36, 1:n): idempotent je
// (Kandidat, Kampagne). client_id wird aus der Kampagne übernommen - der DB-Trigger
// client_assignments_sync_campaign erzwingt das zusätzlich und lehnt Lead-Kampagnen ab.
// Gibt die ID der (bestehenden oder neuen) Zuordnung zurück.
export async function ensureCampaignAssignment(
  supabase: Supabase,
  candidateId: string,
  campaignId: string,
  createdBy?: string | null
): Promise<string> {
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

  const { data: existing, error: lookupError } = await supabase
    .from("client_assignments")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("campaign_id", campaignId)
    .is("removed_at", null)
    .maybeSingle()
  if (lookupError) throw new Error(lookupError.message)
  if (existing) return existing.id

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
  return inserted.id
}
