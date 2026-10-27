// Leads aus der eigenen Meta-Kampagne einer Kanzlei (Paket 80/83) gehören eindeutig zu
// dieser Kampagne. Setzt das Team so einen Lead auf "vorqualifiziert", wird er der Kampagne
// automatisch zugeordnet (Paket 93) - die Automatisierung "Kandidat der Kampagne
// zugeordnet" schickt dann die Mail an die Kanzlei. Vorher ging das über einen eigenen
// Kasten mit "Zuordnen"-Knopf.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { ASSIGNABLE_STATUS, clientNotLiveError, ensureCampaignAssignment, isSampleCandidate } from "@/lib/client-assignment"

type Db = SupabaseClient<Database>

export type OwnLeadAssignOutcome =
  | { kind: "assigned"; campaignId: string; clientId: string }
  // Kanzlei nicht live o. Ä.: Lead bleibt vorqualifiziert in der Kampagne, ohne Zuordnung.
  | { kind: "not_assigned"; campaignId: string; reason: string }

// null = kein Lead aus einer eigenen Kanzlei-Kampagne (oder schon zugeordnet).
export async function assignOwnCampaignLead(db: Db, candidateId: string, createdBy: string | null): Promise<OwnLeadAssignOutcome | null> {
  const { data: candidate } = await db.from("candidates").select("status, campaign_id, campaign_only, tags").eq("id", candidateId).maybeSingle()
  if (!candidate?.campaign_only || !candidate.campaign_id || candidate.status !== ASSIGNABLE_STATUS || isSampleCandidate(candidate.tags)) return null
  const { data: campaign } = await db.from("campaigns").select("id, title, kind, client_id").eq("id", candidate.campaign_id).maybeSingle()
  if (!campaign || campaign.kind !== "kanzlei" || !campaign.client_id) return null

  const { data: active } = await db
    .from("client_assignments")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("client_id", campaign.client_id)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle()
  if (active) return null

  const notLive = await clientNotLiveError(db, campaign.client_id)
  if (notLive) {
    await db.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "note",
      content: `Nicht an die Kanzlei gegangen: ${notLive}`,
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    return { kind: "not_assigned", campaignId: campaign.id, reason: notLive }
  }

  try {
    await ensureCampaignAssignment(db, candidateId, campaign.id, createdBy)
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    await db.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "note",
      content: `Nicht an die Kanzlei gegangen: ${reason}`,
      ...(createdBy ? { created_by: createdBy } : {}),
    })
    return { kind: "not_assigned", campaignId: campaign.id, reason }
  }
  await db.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Vorqualifiziert und damit automatisch der Kampagne „${campaign.title}“ zugeordnet.`,
    ...(createdBy ? { created_by: createdBy } : {}),
  })
  return { kind: "assigned", campaignId: campaign.id, clientId: campaign.client_id }
}
