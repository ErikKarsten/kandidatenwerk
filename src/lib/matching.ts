import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

const EARTH_RADIUS_KM = 6371

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100
}

type Supabase = SupabaseClient<Database>

export async function matchCandidateToCampaigns(supabase: Supabase, candidateId: string): Promise<void> {
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("id, berufsbild, lat, lng")
    .eq("id", candidateId)
    .single()

  if (candidateError) throw new Error(candidateError.message)
  if (!candidate.berufsbild || candidate.lat === null || candidate.lng === null) return

  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, lat, lng, radius_km")
    .eq("status", "active")
    .eq("berufsbild", candidate.berufsbild)
    .not("lat", "is", null)
    .not("lng", "is", null)

  if (campaignsError) throw new Error(campaignsError.message)
  if (!campaigns || campaigns.length === 0) return

  const matches = campaigns
    .map((campaign) => ({
      campaign,
      distance: haversineDistanceKm(candidate.lat!, candidate.lng!, campaign.lat!, campaign.lng!),
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
    .select("id, status, berufsbild, lat, lng, radius_km")
    .eq("id", campaignId)
    .single()

  if (campaignError) throw new Error(campaignError.message)
  if (campaign.status !== "active") return
  if (!campaign.berufsbild || campaign.lat === null || campaign.lng === null) return

  const { data: candidates, error: candidatesError } = await supabase
    .from("candidates")
    .select("id, lat, lng")
    .eq("berufsbild", campaign.berufsbild)
    .not("lat", "is", null)
    .not("lng", "is", null)

  if (candidatesError) throw new Error(candidatesError.message)
  if (!candidates || candidates.length === 0) return

  const matches = candidates
    .map((candidate) => ({
      candidate,
      distance: haversineDistanceKm(candidate.lat!, candidate.lng!, campaign.lat!, campaign.lng!),
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
