import { createSupabaseServerClient } from "@/lib/supabase-server"
import { MapOverview, type MapClientPoint, type MapCandidatePoint } from "./map-overview"
import { getActiveAdAreas } from "@/lib/meta-campaigns-queries"
import type { SupabaseClient } from "@supabase/supabase-js"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { LIVE_PHASE } from "@/lib/client-project"

type MapCandidateRow = { id: string; first_name: string; last_name: string; lat: number | null; lng: number | null; campaign_id: string | null; berufsbild: string | null }

async function fetchAllCandidates(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<{ data: MapCandidateRow[] }> {
  const rows: MapCandidateRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("candidates")
      .select("id, first_name, last_name, lat, lng, campaign_id, berufsbild")
      .eq("is_demo", false)
      // Leads aus eigenen Meta-Kampagnen von Kanzleien gehören nur in die Kampagne (Paket 83).
      .eq("campaign_only", false)
      // Nur vorqualifizierte Kandidaten auf der Karte (Paket 73) - keine abgelehnten oder neuen.
      .eq("status", ASSIGNABLE_STATUS)
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { data: rows }
}

export default async function MapPage() {
  const supabase = await createSupabaseServerClient()

  // Drei getrennte, schlanke Abfragen statt eines verschachtelten Selects
  // (candidates -> campaigns -> clients): vermeidet die bekannte Array/Objekt-
  // Mehrdeutigkeit von Supabase-Joins und ist bei diesen Tabellengrößen
  // (Kunden/Kampagnen/Kandidaten jeweils im niedrigen drei- bis vierstelligen Bereich)
  // trivial günstig. campaigns wird nur für die client_id-Zuordnung gebraucht (Kandidat
  // -> Kampagne -> Kunde), nicht für die Kampagnen-eigenen Koordinaten - der
  // Näherungswert soll laut Vorgabe explizit vom Kanzlei-/Kundenstandort kommen.
  const [{ data: clients }, { data: candidates }, { data: campaigns }, adAreas, { data: locations }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, lat, lng, project_phase")
      .not("lat", "is", null)
      .not("lng", "is", null),
    // Seitenweise: mit den Musterdatensätzen (Paket 62) sind es mehr als die 1.000 Zeilen,
    // die eine einzelne Abfrage liefert.
    fetchAllCandidates(supabase),
    supabase.from("campaigns").select("id, client_id"),
    // Werbegebiete laufender Meta-Kampagnen (Atlas T-38) für die Ebene "Werbegebiete".
    getActiveAdAreas(supabase as unknown as SupabaseClient),
    // Alle Standorte aller Kunden als Kanzlei-Punkte (Paket 16, T-75).
    supabase.from("client_locations").select("client_id, plz, ort, lat, lng, clients(name, project_phase)").not("lat", "is", null).not("lng", "is", null),
  ])

  const clientList = clients ?? []
  const clientById = new Map(clientList.map((c) => [c.id, c]))
  const campaignClientId = new Map((campaigns ?? []).map((c) => [c.id, c.client_id]))

  const located = new Set((locations ?? []).map((l) => l.client_id))
  // Als Kanzlei-Punkte nur Kunden in der Projektphase "Live" (Paket 78). Der ungefähre
  // Standort von Kandidaten (über die Kampagne) nutzt weiter alle Kunden.
  const clientPoints: MapClientPoint[] = [
    ...(locations ?? []).flatMap((l) => {
      const rel = l.clients as { name: string; project_phase: string | null } | { name: string; project_phase: string | null }[] | null
      const client = Array.isArray(rel) ? rel[0] : rel
      if (client?.project_phase !== LIVE_PHASE) return []
      return {
        id: l.client_id,
        name: client.name ?? "Kanzlei",
        lat: l.lat as number,
        lng: l.lng as number,
        place: [l.plz, l.ort].filter(Boolean).join(" "),
      }
    }),
    // Kunden ohne Standortliste (sollte nach der Migration nicht vorkommen) wie bisher.
    ...clientList.filter((c) => !located.has(c.id) && c.project_phase === LIVE_PHASE).map((c) => ({ id: c.id, name: c.name, lat: c.lat as number, lng: c.lng as number })),
  ]

  const candidatePoints: MapCandidatePoint[] = []
  for (const candidate of candidates ?? []) {
    const name = `${candidate.first_name} ${candidate.last_name}`

    if (candidate.lat !== null && candidate.lng !== null) {
      candidatePoints.push({
        id: candidate.id,
        name,
        berufsbild: candidate.berufsbild,
        lat: candidate.lat,
        lng: candidate.lng,
        approximate: false,
      })
      continue
    }

    if (!candidate.campaign_id) continue
    const clientId = campaignClientId.get(candidate.campaign_id)
    if (!clientId) continue
    const client = clientById.get(clientId)
    if (!client || client.lat === null || client.lng === null) continue

    candidatePoints.push({
      id: candidate.id,
      name,
      berufsbild: candidate.berufsbild,
      lat: client.lat,
      lng: client.lng,
      approximate: true,
    })
  }

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Karte</h1>
        <p className="mt-1 text-sm text-gray-500">Übersicht aller Kanzlei-Standorte und vorqualifizierten Kandidaten</p>
      </div>

      <MapOverview clients={clientPoints} candidates={candidatePoints} adAreas={adAreas} />
    </div>
  )
}
