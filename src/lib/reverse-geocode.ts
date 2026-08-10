// Reverse-Geocoding über Nominatim (OpenStreetMap) - liefert zu Koordinaten einen
// Ortsnamen, rein informativ fürs UI (z.B. "40210 (Düsseldorf)"). Wird bewusst nur
// EINMAL beim Speichern aufgerufen (nicht bei jedem Seitenaufruf) - siehe
// updateClientAction in src/app/dashboard/clients/[id]/actions.ts - um Nominatims
// Nutzungsrichtlinien einzuhalten (https://operations.osmfoundation.org/policies/nominatim/):
// max. 1 Request/Sekunde, kein Bulk-Geocoding, dafür aber ein aussagekräftiger
// User-Agent mit Kontaktmöglichkeit ist Pflicht (sonst drohen Sperren).
//
// Schlägt bewusst niemals hart fehl: bei Netzwerkfehlern, Timeouts oder fehlendem
// Adressfeld wird null zurückgegeben - der Aufrufer speichert dann einfach keinen Ort,
// die bereits erfolgreich ermittelten PLZ/lat/lng bleiben davon unberührt.
const NOMINATIM_USER_AGENT = "kandidatenwerk (tools@endlichmitarbeiter.de)"
const REVERSE_GEOCODE_TIMEOUT_MS = 5_000

interface NominatimReverseResponse {
  address?: {
    city?: string
    town?: string
    village?: string
    municipality?: string
  }
}

export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse")
    url.searchParams.set("lat", String(lat))
    url.searchParams.set("lon", String(lng))
    url.searchParams.set("format", "json")

    const response = await fetch(url, {
      headers: { "User-Agent": NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(REVERSE_GEOCODE_TIMEOUT_MS),
    })

    if (!response.ok) return null

    const data = (await response.json()) as NominatimReverseResponse
    const address = data.address
    if (!address) return null

    // Je nach Siedlungsgröße liefert Nominatim den Ortsnamen unter unterschiedlichen
    // Adressfeldern - city für (Groß-)Städte, town/village für kleinere Orte,
    // municipality als letzter Fallback für manche ländliche Gemeinden.
    return address.city ?? address.town ?? address.village ?? address.municipality ?? null
  } catch (err) {
    console.warn(
      "[reverseGeocodeCity] Nominatim-Anfrage fehlgeschlagen:",
      err instanceof Error ? err.message : err
    )
    return null
  }
}
