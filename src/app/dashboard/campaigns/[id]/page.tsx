import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getEmailTemplates } from "../../einstellungen/actions"
import { CampaignDetail } from "./campaign-detail"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  // Eigene agency_id laden (gleiches Muster wie einstellungen/page.tsx), um die
  // agenturweiten E-Mail-Vorlagen fuer die "Vorlage waehlen"-Dropdown im
  // Automatisierungs-Editor zu laden (automations-tab.tsx).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: ownProfile } = user
    ? await supabase.from("profiles").select("agency_id").eq("id", user.id).single()
    : { data: null }
  const emailTemplates = ownProfile?.agency_id ? await getEmailTemplates(ownProfile.agency_id) : []

  const [{ data: campaign }, { data: candidates }, { data: automations }, { data: matchRows }, { data: clientRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, clients(id, name)")
      .eq("id", id)
      .single(),
    supabase
      .from("candidates")
      .select("id, first_name, last_name, email, phone, status, berufsbild, plz, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_automations")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("candidate_campaign_matches")
      .select("id, distance_km, status, matched_at, candidates(id, first_name, last_name, berufsbild, lat, lng)")
      .eq("campaign_id", id)
      .order("matched_at", { ascending: false }),
    // Für die "Duplizieren"/"Verschieben"-Kunde-Auswahl (campaign-detail.tsx).
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
  ])

  if (!campaign) notFound()

  const client = Array.isArray(campaign.clients)
    ? campaign.clients[0] ?? null
    : (campaign.clients as { id: string; name: string } | null)

  type MatchCandidateJoin = {
    id: string
    first_name: string
    last_name: string
    berufsbild: string | null
    lat: number | null
    lng: number | null
  } | null
  const matches = (matchRows ?? []).map((m) => {
    const matchCandidate = m.candidates as MatchCandidateJoin
    return {
      id: m.id,
      candidateId: matchCandidate?.id ?? "",
      firstName: matchCandidate?.first_name ?? "Unbekannt",
      lastName: matchCandidate?.last_name ?? "",
      distanceKm: m.distance_km,
      status: m.status,
      matchedAt: m.matched_at,
      berufsbild: matchCandidate?.berufsbild ?? null,
      lat: matchCandidate?.lat ?? null,
      lng: matchCandidate?.lng ?? null,
    }
  })

  return (
    <CampaignDetail
      campaign={{
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        status: campaign.status,
        meta_campaign_id: campaign.meta_campaign_id,
        meta_form_id: campaign.meta_form_id ?? null,
        meta_form_name: campaign.meta_form_name ?? null,
        meta_field_mapping: (campaign.meta_field_mapping as string[] | null) ?? null,
        berufsbild: campaign.berufsbild ?? null,
        plz: campaign.plz ?? null,
        lat: campaign.lat ?? null,
        lng: campaign.lng ?? null,
        radius_km: campaign.radius_km ?? null,
        leadtable_campaign_id: campaign.leadtable_campaign_id ?? null,
        kanzleistelle_job_id: campaign.kanzleistelle_job_id ?? null,
        meta_webhook_last_test_at: campaign.meta_webhook_last_test_at ?? null,
        client,
      }}
      candidates={candidates ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      automations={(automations ?? []) as any}
      matches={matches}
      emailTemplates={emailTemplates}
      clients={clientRows ?? []}
    />
  )
}
