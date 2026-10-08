import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { campaignPoints, nearestDistanceKm } from "@/lib/campaign-locations"

export { haversineDistanceKm } from "@/lib/geo-distance"

type Supabase = SupabaseClient<Database>

export async function matchCandidateToCampaigns(supabase: Supabase, candidateId: string): Promise<void> {
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, berufsbild, lat, lng, is_demo")
    .eq("id", candidateId)
    .single()

  if (candidateError) throw new Error(candidateError.message)
  if (candidate.is_demo) return
  if (!candidate.berufsbild || candidate.lat === null || candidate.lng === null) return

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, plz, lat, lng, radius_km, extra_plz")
    .eq("status", "active")
    .eq("kind", "kanzlei") // Lead-Kampagnen (T-36) sind keine Zuordnungsziele
    .eq("is_demo", false) // Beispielkampagnen (Paket 18) nie matchen
    .eq("berufsbild", candidate.berufsbild)
    .not("lat", "is", null)
    .not("lng", "is", null)

  if (campaignsError) throw new Error(campaignsError.message)
  if (!campaigns || campaigns.length === 0) return

  const matches = campaigns
    .map((campaign) => ({
      campaign,
      distance: nearestDistanceKm(campaignPoints(campaign), candidate.lat!, candidate.lng!)!,
    }))
    .filter(({ campaign, distance }) => distance <= campaign.radius_km)
    .map(({ campaign, distance }) => ({
      candidate_id: candidateId,
      campaign_id: campaign.id,
      distance_km: distance,
      matched_automatically: true,
      status: "neu",
    }))

  if (matches.length === 0) return

  const { error: upsertError } = await supabase
    .from("candidate_campaign_matches")
    .upsert(matches, { onConflict: "candidate_id,campaign_id", ignoreDuplicates: true })

  if (upsertError) throw new Error(upsertError.message)
}

export async function matchCampaignToCandidates(supabase: Supabase, campaignId: string): Promise<void> {
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, status, kind, berufsbild, plz, lat, lng, radius_km, is_demo, extra_plz")
    .eq("id", campaignId)
    .single()

  if (campaignError) throw new Error(campaignError.message)
  if (campaign.status !== "active" || campaign.kind !== "kanzlei" || campaign.is_demo) return
  if (!campaign.berufsbild || campaign.lat === null || campaign.lng === null) return

  const { data: candidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, lat, lng")
    .eq("berufsbild", campaign.berufsbild)
    .eq("is_demo", false)
    .not("lat", "is", null)
    .not("lng", "is", null)

  if (candidatesError) throw new Error(candidatesError.message)
  if (!candidates || candidates.length === 0) return

  const points = campaignPoints(campaign)
  const matches = candidates
    .map((candidate) => ({
      candidate,
      distance: nearestDistanceKm(points, candidate.lat!, candidate.lng!)!,
    }))
    .filter(({ distance }) => distance <= campaign.radius_km)
    .map(({ candidate, distance }) => ({
      candidate_id: candidate.id,
      campaign_id: campaignId,
      distance_km: distance,
      matched_automatically: true,
      status: "neu",
    }))

  if (matches.length === 0) return

  const { error: upsertError } = await supabase
    .from("candidate_campaign_matches")
    .upsert(matches, { onConflict: "candidate_id,campaign_id", ignoreDuplicates: true })

  if (upsertError) throw new Error(upsertError.message)
}
