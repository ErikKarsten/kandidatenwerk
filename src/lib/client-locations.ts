// Standorte je Kunde (Paket 16, T-75). Genau ein Hauptstandort, der mit
// clients.plz/ort/lat/lng abgeglichen bleibt - alles, was nur eine PLZ kennt (Dubletten,
// Kampagnen-Standard, Werbegebiet), arbeitet damit unverändert weiter.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { geocodePlz } from "@/lib/geocode-plz"

type Db = SupabaseClient<Database>

export interface ClientLocation {
  id: string
  strasse: string | null
  plz: string
  ort: string | null
  lat: number | null
  lng: number | null
  is_primary: boolean
}

// Alle "PLZ Ort"-Angaben aus einem Freitext wie "Laiberstr. 32, 72160 Horb; 50668 Köln".
export function parseLocationsFromText(text: string | null | undefined): { plz: string; ort: string | null }[] {
  const found = new Map<string, string | null>()
  for (const m of (text ?? "").matchAll(/\b(\d{5})(?:\s+([A-ZÄÖÜ][\wäöüß.-]*(?:[ -][A-ZÄÖÜa-zäöüß][\wäöüß.-]*)*))?/g)) {
    // Kleingeschriebene Wörter am Ende gehören nicht zum Ort ("Köln und ..."), mittendrin
    // schon ("Buchholz in der Nordheide").
    const ort = m[2]?.trim().replace(/(?:[ -][a-zäöüß][\wäöüß.-]*)+$/, "") || null
    if (!found.has(m[1])) found.set(m[1], ort)
  }
  return [...found].map(([plz, ort]) => ({ plz, ort }))
}

// Hauptstandort -> Stammdaten (clients.plz/ort/lat/lng). Ohne Standort bleiben die
// Stammdaten leer.
export async function syncPrimaryLocationToClient(db: Db, clientId: string): Promise<void> {
  const { data: primary } = await db.from("client_locations").select("plz, ort, lat, lng").eq("client_id", clientId).eq("is_primary", true).maybeSingle()
  const { error } = await db
    .from("clients")
    .update({ plz: primary?.plz ?? null, ort: primary?.ort ?? null, lat: primary?.lat ?? null, lng: primary?.lng ?? null })
    .eq("id", clientId)
  if (error) throw new Error(error.message)
}

// Legt einen Standort an, falls es für die PLZ noch keinen gibt. Der erste Standort eines
// Kunden wird Hauptstandort (und landet in den Stammdaten).
export async function ensureClientLocation(
  db: Db,
  clientId: string,
  input: { plz: string; ort?: string | null; strasse?: string | null }
): Promise<void> {
  const plz = input.plz.trim()
  if (!/^\d{5}$/.test(plz)) return
  const { data: existing } = await db.from("client_locations").select("plz").eq("client_id", clientId)
  if ((existing ?? []).some((l) => l.plz === plz)) return
  const coords = geocodePlz(plz)
  const isPrimary = (existing ?? []).length === 0
  const { error } = await db.from("client_locations").insert({
    client_id: clientId,
    plz,
    ort: input.ort?.trim() || null,
    strasse: input.strasse?.trim() || null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    is_primary: isPrimary,
  })
  if (error) throw new Error(error.message)
  if (isPrimary) await syncPrimaryLocationToClient(db, clientId)
}
