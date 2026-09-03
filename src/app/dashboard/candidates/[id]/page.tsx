import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CandidateDetail } from "./candidate-detail"

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [
    { data: candidate },
    { data: history },
    { data: fileRows },
    { data: matchRows },
    { data: assignmentRows },
    { data: clientRows },
    { data: profileRows },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select("*, campaigns(title, clients(id, name))")
      .eq("id", id)
      .single(),
    supabase
      .from("candidate_history")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_files")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_campaign_matches")
      .select("id, distance_km, status, matched_at, campaigns(id, title, lat, lng, clients(id, name))")
      .eq("candidate_id", id)
      .order("matched_at", { ascending: false }),
    // Alle aktiven Zuordnungen (nicht mehr nur eine) - ein Kandidat kann jetzt
    // gleichzeitig mehreren Kanzleien zugeordnet sein, siehe assignToClientAction.
    supabase
      .from("client_assignments")
      .select("id, status, client_id")
      .eq("candidate_id", id)
      .is("removed_at", null),
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true }),
    // Für das "Aufgabe erstellen"-Popup direkt auf der Kandidatenseite (Zuweisen-an-Dropdown).
    supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
  ])

  if (!candidate) notFound()

  const creatorIds = [...new Set((history ?? []).map((h) => h.created_by).filter((id): id is string => id !== null))]
  const { data: creatorProfiles } =
    creatorIds.length > 0
      ? await supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : { data: [] }
  const creatorNameById = new Map((creatorProfiles ?? []).map((p) => [p.id, p.full_name]))

  const historyWithCreatorNames = (history ?? []).map((h) => ({
    id: h.id,
    type: h.type,
    content: h.content,
    created_at: h.created_at,
    createdByName: h.created_by ? (creatorNameById.get(h.created_by) ?? null) : null,
  }))

  const files = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from("candidate-files")
        .createSignedUrl(f.file_path, 3600)
      return {
        id: f.id,
        name: f.file_name,
        storage_path: f.file_path,
        size: f.file_size,
        mime_type: f.mime_type,
        created_at: f.created_at,
        signedUrl: urlData?.signedUrl ?? null,
      }
    })
  )

  type CampaignJoin = { title: string; clients: { id: string; name: string } | null } | null
  const campaigns = candidate.campaigns as CampaignJoin

  type MatchCampaignJoin = {
    id: string
    title: string
    lat: number | null
    lng: number | null
    clients: { id: string; name: string } | null
  } | null
  const matches = (matchRows ?? []).map((m) => {
    const matchCampaign = m.campaigns as MatchCampaignJoin
    return {
      id: m.id,
      campaignId: matchCampaign?.id ?? "",
      campaignTitle: matchCampaign?.title ?? "Unbekannte Kampagne",
      clientId: matchCampaign?.clients?.id ?? null,
      clientName: matchCampaign?.clients?.name ?? null,
      distanceKm: m.distance_km,
      status: m.status,
      matchedAt: m.matched_at,
      lat: matchCampaign?.lat ?? null,
      lng: matchCampaign?.lng ?? null,
    }
  })

  const candidateData = {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email,
    phone: candidate.phone,
    status: candidate.status,
    source: candidate.source,
    notes: candidate.notes,
    description: candidate.description,
    berufsbild: candidate.berufsbild ?? null,
    plz: candidate.plz ?? null,
    lat: candidate.lat ?? null,
    lng: candidate.lng ?? null,
    custom_fields: (candidate.custom_fields as Record<string, string> | null) ?? null,
    campaign_id: candidate.campaign_id,
    campaigns: campaigns,
  }

  const activeAssignments = (assignmentRows ?? []).map((a) => ({
    id: a.id,
    clientId: a.client_id,
    status: a.status,
  }))

  const clients = (clientRows ?? []).map((c) => ({ id: c.id, name: c.name }))
  const profiles = (profileRows ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))

  return (
    <CandidateDetail
      candidate={candidateData}
      history={historyWithCreatorNames}
      files={files}
      matches={matches}
      activeAssignments={activeAssignments}
      clients={clients}
      profiles={profiles}
    />
  )
}
