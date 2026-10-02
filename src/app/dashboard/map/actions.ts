"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { forwardGeocode } from "@/lib/forward-geocode"

// Forward-Geocoding für die Orts-/PLZ-Suche auf der Karten-Seite - reine Ansichtsänderung
// (Kartenausschnitt), keine Filterung. PLZ-Eingaben löst map-overview.tsx bereits lokal
// über geocode-plz.ts auf (kein Netzwerk nötig); diese Server Action ist nur für
// Ortsnamen zuständig und nutzt denselben Nominatim-Dienst wie reverse-geocode.ts -
// bewusst serverseitig, damit der vorgeschriebene User-Agent gesetzt werden kann (im
// Browser lässt sich der User-Agent-Header nicht überschreiben) und die
// Nutzungsrichtlinien (max. 1 Request/Sekunde, kein Bulk-Geocoding) eingehalten werden:
// https://operations.osmfoundation.org/policies/nominatim/
export async function searchLocationAction(
  query: string
): Promise<{ lat: number; lng: number } | { error: string }> {
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const guardSupabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(guardSupabase)
  if (staffError) return staffError

  const trimmed = query.trim()
  if (!trimmed) return { error: "Bitte PLZ oder Ort eingeben." }

  try {
    const first = await forwardGeocode(trimmed)
    if (!first) return { error: `Kein Ort gefunden für "${trimmed}".` }

    return first
  } catch (err) {
    console.warn("[searchLocationAction] Nominatim-Anfrage fehlgeschlagen:", err instanceof Error ? err.message : err)
    return { error: "Suche fehlgeschlagen, bitte erneut versuchen." }
  }
}
