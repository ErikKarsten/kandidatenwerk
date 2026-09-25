"use server"

// Forward-Geocoding für die Orts-/PLZ-Suche auf der Karten-Seite - reine Ansichtsänderung
// (Kartenausschnitt), keine Filterung. PLZ-Eingaben löst map-overview.tsx bereits lokal
// über geocode-plz.ts auf (kein Netzwerk nötig); diese Server Action ist nur für
// Ortsnamen zuständig und nutzt denselben Nominatim-Dienst wie reverse-geocode.ts -
// bewusst serverseitig, damit der vorgeschriebene User-Agent gesetzt werden kann (im
// Browser lässt sich der User-Agent-Header nicht überschreiben) und die
// Nutzungsrichtlinien (max. 1 Request/Sekunde, kein Bulk-Geocoding) eingehalten werden:
// https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM_USER_AGENT = "kandidatenwerk (tools@endlichmitarbeiter.de)"
const SEARCH_TIMEOUT_MS = 5_000

interface NominatimSearchResult {
  lat: string
  lon: string
}

export async function searchLocationAction(
  query: string
): Promise<{ lat: number; lng: number } | { error: string }> {
  const trimmed = query.trim()
  if (!trimmed) return { error: "Bitte PLZ oder Ort eingeben." }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search")
    url.searchParams.set("q", trimmed)
    url.searchParams.set("countrycodes", "de")
    url.searchParams.set("format", "json")
    url.searchParams.set("limit", "1")

    const response = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    })
    if (!response.ok) return { error: "Suche fehlgeschlagen, bitte erneut versuchen." }

    const results = (await response.json()) as NominatimSearchResult[]
    const first = results[0]
    if (!first) return { error: `Kein Ort gefunden für "${trimmed}".` }

    return { lat: Number(first.lat), lng: Number(first.lon) }
  } catch (err) {
    console.warn("[searchLocationAction] Nominatim-Anfrage fehlgeschlagen:", err instanceof Error ? err.message : err)
    return { error: "Suche fehlgeschlagen, bitte erneut versuchen." }
  }
}
