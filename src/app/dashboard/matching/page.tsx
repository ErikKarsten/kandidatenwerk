import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { computeSuggestions, loadMatchingInput, pairKey } from "@/lib/matching-suggestions"
import { MatchingOverview, type DismissedMatch, type MatchGroup } from "./matching-overview"

// Matching-Übersicht (Paket 96): vorqualifizierte Kandidaten, die zu einer Live-Kampagne im
// Umkreis passen und dieser Kanzlei noch nie zugeordnet waren. Wird bei jedem Aufruf neu
// berechnet; matching_suggestions liefert "neu seit der letzten Mail" und "Nicht vorschlagen".

export default async function MatchingPage() {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return <p className="p-8 text-sm text-gray-500">{staffError.error}</p>

  const [input, { data: dismissedRows }] = await Promise.all([
    loadMatchingInput(supabase),
    supabase
      .from("matching_suggestions")
      .select(
        `candidate_id, campaign_id, dismissed_at, dismiss_reason,
         candidates!inner(first_name, last_name),
         campaigns(title, clients(name)),
         dismisser:profiles!matching_suggestions_dismissed_by_fkey(full_name)`
      )
      .not("dismissed_at", "is", null)
      .order("dismissed_at", { ascending: false })
      .limit(500),
  ])

  const pairs = computeSuggestions(input)
  const rowByKey = new Map(input.rows.map((r) => [pairKey(r.candidate_id, r.campaign_id), r]))
  const candidates = new Map(input.candidates.map((c) => [c.id, c]))
  const campaigns = new Map(input.campaigns.map((c) => [c.id, c]))

  // Laufende Zuordnungen bei anderen Kanzleien als Hinweis.
  const running = new Map<string, { clientName: string; status: string }[]>()
  for (const a of input.assignments) {
    if (a.removed_at) continue
    running.set(a.candidate_id, [...(running.get(a.candidate_id) ?? []), { clientName: input.clientNames.get(a.client_id) ?? "Kanzlei", status: a.status }])
  }

  const groups = new Map<string, MatchGroup>()
  for (const p of pairs) {
    const campaign = campaigns.get(p.campaignId)!
    const candidate = candidates.get(p.candidateId)!
    const row = rowByKey.get(pairKey(p.candidateId, p.campaignId))
    let group = groups.get(p.campaignId)
    if (!group) {
      group = {
        campaignId: campaign.id,
        campaignTitle: campaign.title,
        clientId: campaign.client_id!,
        clientName: input.liveClients.get(campaign.client_id!) ?? "Kanzlei",
        berufsbild: campaign.berufsbild,
        plz: campaign.plz,
        radiusKm: campaign.radius_km,
        items: [],
      }
      groups.set(p.campaignId, group)
    }
    group.items.push({
      candidateId: candidate.id,
      name: `${candidate.first_name} ${candidate.last_name}`.trim() || "(ohne Namen)",
      email: candidate.email,
      plz: candidate.plz,
      distanceKm: p.distanceKm,
      createdAt: candidate.created_at,
      source: candidate.source,
      // Noch in keiner Sammel-Mail (oder erst seit dem letzten stündlichen Abgleich da).
      isNew: !row?.notified_at,
      running: running.get(candidate.id) ?? [],
    })
  }
  for (const g of groups.values()) g.items.sort((a, b) => Number(b.isNew) - Number(a.isNew) || a.distanceKm - b.distanceKm)
  const sortedGroups = [...groups.values()].sort((a, b) => a.clientName.localeCompare(b.clientName, "de") || a.campaignTitle.localeCompare(b.campaignTitle, "de"))

  const dismissed: DismissedMatch[] = (dismissedRows ?? []).map((r) => {
    const candidate = (Array.isArray(r.candidates) ? r.candidates[0] : r.candidates) as { first_name: string; last_name: string } | null
    const campaign = (Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns) as { title: string; clients: { name: string } | { name: string }[] | null } | null
    const client = campaign ? ((Array.isArray(campaign.clients) ? campaign.clients[0] : campaign.clients) ?? null) : null
    const by = (Array.isArray(r.dismisser) ? r.dismisser[0] : r.dismisser) as { full_name: string | null } | null
    return {
      candidateId: r.candidate_id,
      campaignId: r.campaign_id,
      candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}`.trim() : "(gelöscht)",
      campaignTitle: campaign?.title ?? "(gelöscht)",
      clientName: client?.name ?? null,
      dismissedAt: r.dismissed_at!,
      reason: r.dismiss_reason,
      by: by?.full_name ?? null,
    }
  })

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Matching</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vorqualifizierte Kandidaten mit passendem Berufsbild im Umkreis einer Live-Kampagne, die der Kanzlei noch nie zugeordnet waren.
          „Nicht vorschlagen“ gilt dauerhaft für diese Kampagne.
        </p>
      </div>
      <MatchingOverview groups={sortedGroups} dismissed={dismissed} />
    </div>
  )
}
