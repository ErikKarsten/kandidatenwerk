// Ortsname -> Koordinaten über Nominatim (OpenStreetMap). Gemeinsam genutzt von der
// Kartensuche (dashboard/map/actions.ts) und dem Meta-Kampagnen-Abgleich (Städte im
// Werbe-Targeting haben bei Meta keine Koordinaten). Nutzungsrichtlinien beachten
// (https://operations.osmfoundation.org/policies/nominatim/): User-Agent mit Kontakt
// ist Pflicht, max. 1 Anfrage pro Sekunde, kein Bulk-Geocoding - Aufrufer drosseln und
// Ergebnisse speichern.

const NOMINATIM_USER_AGENT = "kandidatenwerk (tools@endlichmitarbeiter.de)"
const SEARCH_TIMEOUT_MS = 5_000

interface NominatimSearchResult {
  lat: string
  lon: string
}

export async function forwardGeocode(query: string): Promise<{ lat: number; lng: number } | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("q", query)
  url.searchParams.set("countrycodes", "de")
  url.searchParams.set("format", "json")
  url.searchParams.set("limit", "1")

  const response = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  })
  if (!response.ok) throw new Error(`Nominatim antwortet mit ${response.status}`)

  const results = (await response.json()) as NominatimSearchResult[]
  const first = results[0]
  return first ? { lat: Number(first.lat), lng: Number(first.lon) } : null
}
