// Matching-Übersicht (Paket 96): vorqualifizierte Kandidaten, die zu einer Kanzlei-Kampagne
// im Umkreis passen und dieser Kanzlei noch nie zugeordnet waren - auch wenn sie schon bei
// einer anderen Kanzlei laufen (Entscheidung vom 04.11.2026). "Nicht vorschlagen" gilt je
// Kampagne und bleibt dauerhaft in matching_suggestions stehen.
//
// Die Übersicht rechnet bei jedem Aufruf neu (immer aktuell); der stündliche Cronjob
// (/api/cron/matching) gleicht nur die Tabelle ab - für den Zähler im Menü und dafür, welche
// Vorschläge in der Sammel-Mail (Mo + Do) als neu gelten.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { campaignPoints, nearestDistanceKm, type LatLng } from "@/lib/campaign-locations"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { LIVE_PHASE } from "@/lib/client-project"

type Supabase = SupabaseClient<Database>

export interface MatchCandidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  plz: string | null
  lat: number | null
  lng: number | null
  berufsbild: string | null
  source: string
  created_at: string
}

export interface MatchCampaign {
  id: string
  title: string
  client_id: string | null
  berufsbild: string | null
  plz: string | null
  lat: number | null
  lng: number | null
  radius_km: number
  extra_plz: string[] | null
}

export interface MatchAssignment {
  candidate_id: string
  client_id: string
  status: string
  removed_at: string | null
}

export interface SuggestionRow {
  candidate_id: string
  campaign_id: string
  first_seen_at: string
  notified_at: string | null
  dismissed_at: string | null
}

export interface MatchingInput {
  candidates: MatchCandidate[]
  campaigns: MatchCampaign[]
  // Nur Kanzleien in der Projektphase "Live" (Paket 78) bekommen Kandidaten.
  liveClients: Map<string, string>
  // Alle Kanzleinamen, für "läuft schon bei …".
  clientNames: Map<string, string>
  assignments: MatchAssignment[]
  rows: SuggestionRow[]
}

export interface SuggestionPair {
  candidateId: string
  campaignId: string
  distanceKm: number
}

export const pairKey = (candidateId: string, campaignId: string) => `${candidateId}:${campaignId}`

// Reine Funktion ohne Datenbankzugriff, damit die Regeln testbar sind.
export function computeSuggestions(input: MatchingInput): SuggestionPair[] {
  const dismissed = new Set(input.rows.filter((r) => r.dismissed_at).map((r) => pairKey(r.candidate_id, r.campaign_id)))
  // Einmal bei der Kanzlei gewesen (auch zurückgezogen oder abgelehnt) = nicht nochmal.
  const known = new Set(input.assignments.map((a) => `${a.candidate_id}:${a.client_id}`))
  // Wer irgendwo eingestellt wurde, sucht nicht mehr.
  const hired = new Set(input.assignments.filter((a) => !a.removed_at && a.status === "ja").map((a) => a.candidate_id))

  const byBerufsbild = new Map<string, { campaign: MatchCampaign; points: LatLng[] }[]>()
  for (const campaign of input.campaigns) {
    if (!campaign.berufsbild || !campaign.client_id || !input.liveClients.has(campaign.client_id)) continue
    const points = campaignPoints(campaign)
    if (points.length === 0) continue
    byBerufsbild.set(campaign.berufsbild, [...(byBerufsbild.get(campaign.berufsbild) ?? []), { campaign, points }])
  }

  const pairs: SuggestionPair[] = []
  for (const c of input.candidates) {
    if (!c.berufsbild || c.lat === null || c.lng === null || hired.has(c.id)) continue
    for (const { campaign, points } of byBerufsbild.get(c.berufsbild) ?? []) {
      if (known.has(`${c.id}:${campaign.client_id}`) || dismissed.has(pairKey(c.id, campaign.id))) continue
      const distanceKm = nearestDistanceKm(points, c.lat, c.lng)!
      if (distanceKm <= campaign.radius_km) pairs.push({ candidateId: c.id, campaignId: campaign.id, distanceKm })
    }
  }
  return pairs
}

async function pagedRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await fetchPage(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

// Mit dem Nutzer-Client gelten die RLS-Regeln (z.B. Active Sourcing nur fürs eigene Team),
// mit dem Admin-Client (Cronjob) kommen alle Kandidaten.
export async function loadMatchingInput(db: Supabase): Promise<MatchingInput> {
  const [candidates, campaigns, clients, assignments, rows] = await Promise.all([
    pagedRows<MatchCandidate>((from, to) =>
      db
        .from("candidates")
        .select("id, first_name, last_name, email, plz, lat, lng, berufsbild, source, created_at")
        .eq("status", ASSIGNABLE_STATUS)
        .eq("is_demo", false)
        // Leads aus der eigenen Meta-Kampagne einer Kanzlei nur dort (Paket 83).
        .eq("campaign_only", false)
        .not("tags", "cs", `{${SAMPLE_TAG}}`)
        .not("berufsbild", "is", null)
        .not("lat", "is", null)
        .order("id")
        .range(from, to)
    ),
    pagedRows<MatchCampaign>((from, to) =>
      db
        .from("campaigns")
        .select("id, title, client_id, berufsbild, plz, lat, lng, radius_km, extra_plz")
        .eq("kind", "kanzlei")
        .eq("status", "active")
        .eq("is_demo", false)
        .order("id")
        .range(from, to)
    ),
    pagedRows<{ id: string; name: string; project_phase: string | null }>((from, to) => db.from("clients").select("id, name, project_phase").order("id").range(from, to)),
    pagedRows<MatchAssignment>((from, to) => db.from("client_assignments").select("candidate_id, client_id, status, removed_at").order("id").range(from, to)),
    pagedRows<SuggestionRow>((from, to) =>
      db.from("matching_suggestions").select("candidate_id, campaign_id, first_seen_at, notified_at, dismissed_at").order("campaign_id").order("candidate_id").range(from, to)
    ),
  ])
  return {
    candidates,
    campaigns,
    liveClients: new Map(clients.filter((c) => c.project_phase === LIVE_PHASE).map((c) => [c.id, c.name])),
    clientNames: new Map(clients.map((c) => [c.id, c.name])),
    assignments,
    rows,
  }
}

export interface SyncResult {
  open: number
  added: number
  removed: number
}

// Gleicht matching_suggestions mit den aktuell passenden Paaren ab: neue anlegen, nicht mehr
// passende löschen (zugeordnet, Status geändert, Kampagne beendet …). "Nicht vorschlagen"
// bleibt immer stehen.
export async function syncMatchingSuggestions(db: Supabase, input: MatchingInput, pairs: SuggestionPair[]): Promise<SyncResult> {
  const current = new Set(pairs.map((p) => pairKey(p.candidateId, p.campaignId)))
  const existing = new Set(input.rows.map((r) => pairKey(r.candidate_id, r.campaign_id)))

  const toInsert = pairs
    .filter((p) => !existing.has(pairKey(p.candidateId, p.campaignId)))
    .map((p) => ({ candidate_id: p.candidateId, campaign_id: p.campaignId, distance_km: Math.round(p.distanceKm * 10) / 10 }))
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await db.from("matching_suggestions").upsert(toInsert.slice(i, i + 500), { onConflict: "candidate_id,campaign_id", ignoreDuplicates: true })
    if (error) throw new Error(error.message)
  }

  const stale = new Map<string, string[]>()
  for (const r of input.rows) {
    if (r.dismissed_at || current.has(pairKey(r.candidate_id, r.campaign_id))) continue
    stale.set(r.campaign_id, [...(stale.get(r.campaign_id) ?? []), r.candidate_id])
  }
  let removed = 0
  for (const [campaignId, candidateIds] of stale) {
    for (let i = 0; i < candidateIds.length; i += 100) {
      const ids = candidateIds.slice(i, i + 100)
      const { error } = await db.from("matching_suggestions").delete().eq("campaign_id", campaignId).in("candidate_id", ids).is("dismissed_at", null)
      if (error) throw new Error(error.message)
      removed += ids.length
    }
  }

  return { open: pairs.length, added: toInsert.length, removed }
}
