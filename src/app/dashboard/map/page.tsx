import { createSupabaseServerClient } from "@/lib/supabase-server"
import { MapOverview, type MapClientPoint, type MapCandidatePoint } from "./map-overview"

export default async function MapPage() {
  const supabase = await createSupabaseServerClient()

  // Drei getrennte, schlanke Abfragen statt eines verschachtelten Selects
  // (candidates -> campaigns -> clients): vermeidet die bekannte Array/Objekt-
  // Mehrdeutigkeit von Supabase-Joins und ist bei diesen Tabellengrößen
  // (Kunden/Kampagnen/Kandidaten jeweils im niedrigen drei- bis vierstelligen Bereich)
  // trivial günstig. campaigns wird nur für die client_id-Zuordnung gebraucht (Kandidat
  // -> Kampagne -> Kunde), nicht für die Kampagnen-eigenen Koordinaten - der
  // Näherungswert soll laut Vorgabe explizit vom Kanzlei-/Kundenstandort kommen.
  const [{ data: clients }, { data: candidates }, { data: campaigns }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null),
    supabase.from("candidates").select("id, first_name, last_name, lat, lng, campaign_id"),
    supabase.from("campaigns").select("id, client_id"),
  ])

  const clientList = clients ?? []
  const clientById = new Map(clientList.map((c) => [c.id, c]))
  const campaignClientId = new Map((campaigns ?? []).map((c) => [c.id, c.client_id]))

  const clientPoints: MapClientPoint[] = clientList.map((c) => ({
    id: c.id,
    name: c.name,
    lat: c.lat as number,
    lng: c.lng as number,
  }))

  const candidatePoints: MapCandidatePoint[] = []
  for (const candidate of candidates ?? []) {
    const name = `${candidate.first_name} ${candidate.last_name}`

    if (candidate.lat !== null && candidate.lng !== null) {
      candidatePoints.push({
        id: candidate.id,
        name,
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
      lat: client.lat,
      lng: client.lng,
      approximate: true,
    })
  }

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Karte</h1>
        <p className="mt-1 text-sm text-gray-500">Übersicht aller Kanzlei-Standorte und Kandidaten</p>
      </div>

      <MapOverview clients={clientPoints} candidates={candidatePoints} />
    </div>
  )
}
