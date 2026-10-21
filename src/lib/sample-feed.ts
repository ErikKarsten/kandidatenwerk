// Beispielkandidaten für Live-Kunden (Paket 76): Ab dem Wechsel auf "Live" (clients.live_since)
// bekommt jede Kanzlei über drei Monate insgesamt fünf Musterdatensätze in ihre
// Kanzlei-Kampagnen - auch bei mehreren Kampagnen zusammen fünf. Zuerst aus dem Pool: freie
// Musterdatensätze mit passendem Berufsbild im Umkreis von 30 km um die Kampagne; nur wenn
// keiner passt, wird einer neu erzeugt. Ein zugeordneter Musterdatensatz gehört danach
// exklusiv dieser Kanzlei. Die Kanzleien werden im Gespräch darüber informiert, dass es
// Beispielkandidaten sind.
import type { SupabaseClient } from "@supabase/supabase-js"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { campaignPoints, nearestDistanceKm } from "@/lib/campaign-locations"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { geocodePlz, nearestPlz } from "@/lib/geocode-plz"
import { generateSamples, insertSampleCandidate, pickSamplePeople } from "@/lib/sample-candidates"

export const SAMPLE_FEED_TOTAL = 5
export const SAMPLE_FEED_RADIUS_KM = 30
// Erster nach 3 Tagen, dann alle 18 Tage: der fünfte nach 75 Tagen, also innerhalb von 3 Monaten.
const FIRST_AFTER_DAYS = 3
const EVERY_DAYS = 18
// Ein neu erzeugter Musterdatensatz braucht bis zu gut einer Minute (KI).
const GENERATE_RESERVE_MS = 100_000

export function sampleFeedDue(liveSince: string, now: Date): number {
  const days = (now.getTime() - Date.parse(liveSince)) / 86_400_000
  if (!Number.isFinite(days) || days < FIRST_AFTER_DAYS) return 0
  return Math.min(SAMPLE_FEED_TOTAL, Math.floor((days - FIRST_AFTER_DAYS) / EVERY_DAYS) + 1)
}

export interface SampleFeedResult {
  clients: number
  assigned: number
  generated: number
  skipped: string[]
  errors: string[]
  // Probelauf: was passieren würde.
  planned: string[]
}

interface FeedCampaign {
  id: string
  client_id: string
  title: string
  berufsbild: string | null
  plz: string | null
  lat: number | null
  lng: number | null
  extra_plz: string[] | null
}

interface PoolSample {
  id: string
  berufsbild: string | null
  lat: number | null
  lng: number | null
}

async function pages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

export async function runSampleFeed(
  db: SupabaseClient,
  opts: { now?: Date; deadline?: number; dryRun?: boolean } = {}
): Promise<SampleFeedResult> {
  const now = opts.now ?? new Date()
  const deadline = opts.deadline ?? Number.POSITIVE_INFINITY
  const result: SampleFeedResult = { clients: 0, assigned: 0, generated: 0, skipped: [], errors: [], planned: [] }

  const { data: clients, error: clientError } = await db
    .from("clients")
    .select("id, name, live_since")
    .eq("project_phase", "live")
    .not("live_since", "is", null)
  if (clientError) throw new Error(clientError.message)

  const campaigns = await pages<FeedCampaign>((from, to) =>
    db
      .from("campaigns")
      .select("id, client_id, title, berufsbild, plz, lat, lng, extra_plz")
      .eq("kind", "kanzlei")
      .eq("status", "active")
      .eq("is_demo", false)
      .order("created_at")
      .range(from, to)
  )
  const samples = await pages<PoolSample>((from, to) =>
    db.from("candidates").select("id, berufsbild, lat, lng").contains("tags", [SAMPLE_TAG]).order("id").range(from, to)
  )
  // Alle Zuordnungen von Musterdatensätzen (auch entfernte: zählen für die fünf und machen
  // den Datensatz exklusiv).
  const sampleIds = new Set(samples.map((s) => s.id))
  const assignments = await pages<{ candidate_id: string; client_id: string }>((from, to) =>
    db.from("client_assignments").select("candidate_id, client_id").order("id").range(from, to)
  )
  const ownerOf = new Map<string, string>()
  const countByClient = new Map<string, number>()
  for (const a of assignments) {
    if (!sampleIds.has(a.candidate_id)) continue
    ownerOf.set(a.candidate_id, a.client_id)
    countByClient.set(a.client_id, (countByClient.get(a.client_id) ?? 0) + 1)
  }
  const labels = new Map((await fetchBerufsbilder(db as never)).map((o) => [o.value, o.label]))

  for (const client of clients ?? []) {
    const due = sampleFeedDue(client.live_since as string, now)
    const have = countByClient.get(client.id) ?? 0
    if (have >= due) continue
    result.clients++
    const usable = campaigns.filter((c) => c.client_id === client.id && c.berufsbild && campaignPoints(c).length > 0)
    if (!usable.length) {
      result.skipped.push(`${client.name}: keine aktive Kanzlei-Kampagne mit Standort und Berufsbild`)
      continue
    }
    // Reihum über die Kampagnen der Kanzlei - zusammen bleiben es fünf.
    const campaign = usable[have % usable.length]
    const points = campaignPoints(campaign)
    const pool = samples.filter((s) => {
      if (s.berufsbild !== campaign.berufsbild || s.lat === null || s.lng === null || ownerOf.has(s.id)) return false
      const d = nearestDistanceKm(points, s.lat, s.lng)
      return d !== null && d <= SAMPLE_FEED_RADIUS_KM
    })
    const number = have + 1

    if (opts.dryRun) {
      result.planned.push(`${client.name} · Kampagne „${campaign.title}“ · Nr. ${number} von ${SAMPLE_FEED_TOTAL} · ${pool.length ? `aus dem Pool (${pool.length} passende)` : "neu erzeugen"}`)
      if (pool.length) ownerOf.set(pool[0].id, client.id)
      continue
    }

    try {
      let candidateId: string
      if (pool.length) {
        candidateId = pool[Math.floor(Math.random() * pool.length)].id
      } else {
        if (deadline - Date.now() < GENERATE_RESERVE_MS) break
        const plz = campaign.plz && geocodePlz(campaign.plz) ? campaign.plz : nearestPlz(points[0].lat, points[0].lng)
        if (!plz) throw new Error("Kampagne ohne verwertbare PLZ")
        const [person] = pickSamplePeople(plz)
        const generated = await generateSamples({ value: campaign.berufsbild!, label: labels.get(campaign.berufsbild!) ?? campaign.berufsbild! }, [person])
        if (!generated.length) throw new Error("KI hat kein passendes Profil geliefert")
        candidateId = await insertSampleCandidate(db as never, generated[0].sample, generated[0].person, campaign.berufsbild!, null)
        const coords = geocodePlz(generated[0].person.plz)
        samples.push({ id: candidateId, berufsbild: campaign.berufsbild, lat: coords?.lat ?? null, lng: coords?.lng ?? null })
        sampleIds.add(candidateId)
        result.generated++
      }
      const { error } = await db
        .from("client_assignments")
        .insert({ candidate_id: candidateId, client_id: client.id, campaign_id: campaign.id, status: "inbox" })
      if (error) throw new Error(error.message)
      ownerOf.set(candidateId, client.id)
      countByClient.set(client.id, number)
      await db.from("candidate_history").insert({
        candidate_id: candidateId,
        type: "note",
        content: `Beispielkandidat automatisch zugeordnet: „${client.name}“, Kampagne „${campaign.title}“ (${number} von ${SAMPLE_FEED_TOTAL}).`,
      })
      result.assigned++
    } catch (err) {
      result.errors.push(`${client.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (deadline - Date.now() < 20_000) break
  }
  return result
}
