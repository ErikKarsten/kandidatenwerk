// Beispiel-Lead (Paket 14, T-68): Jeder neue Kunde bekommt einen deutlich markierten
// Demo-Kandidaten in einer Beispielkampagne (Paket 18), damit man im Gespräch und im Kundenportal zeigen kann, wie ein Lead
// aussieht. Er passt zur ersten gesuchten Stelle (Berufsbild, PLZ), sonst
// Steuerfachangestellte/r am Kanzleistandort. is_demo hält ihn aus "Alle Kandidaten",
// Statistiken, Matching, Karte und Dublettenprüfung heraus.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { geocodePlz } from "@/lib/geocode-plz"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"

export const DEMO_FALLBACK_BERUFSBILD = "steuerfachangestellte"

export interface DemoTarget {
  berufsbild: string
  plz: string | null
}

// Erste Stelle des Kunden (nach Reihenfolge), sonst Fallback am Kanzleistandort.
export function pickDemoTarget(
  positions: { berufsbild: string | null; plz: string | null; sort_order: number; created_at: string }[],
  clientPlz: string | null
): DemoTarget {
  const first = [...positions].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))[0]
  return {
    // Nur erlaubte Werte (CHECK-Constraint auf candidates.berufsbild).
    berufsbild: BERUFSBILD_OPTIONS.some((o) => o.value === first?.berufsbild) ? first!.berufsbild! : DEMO_FALLBACK_BERUFSBILD,
    plz: first?.plz?.trim() || clientPlz?.trim() || null,
  }
}

export function buildDemoCandidate(target: DemoTarget) {
  const coords = target.plz ? geocodePlz(target.plz) : null
  const label = BERUFSBILD_OPTIONS.find((o) => o.value === target.berufsbild)?.label ?? "Steuerfachangestellte"
  return {
    first_name: "Max",
    last_name: "Mustermann (Beispiel)",
    email: "max.mustermann@example.com",
    phone: "0151 12345678",
    // Vorqualifiziert, damit er im Kundenportal erscheint (Paket 19, T-86).
    status: "vorqualifiziert",
    source: "manual",
    is_demo: true,
    berufsbild: target.berufsbild,
    plz: target.plz,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    custom_fields: {
      ausbildung: `Abgeschlossene Ausbildung als ${label}`,
      erreichbarkeit: "Werktags ab 17 Uhr",
      verfuegbar_ab: "In 3 Monaten (Kündigungsfrist)",
      wechselgrund: "Wünscht sich mehr Wertschätzung und flexiblere Arbeitszeiten",
      erwartungen_neuer_ag: "Homeoffice-Tage, modernes Arbeiten mit DATEV, gutes Team",
      bevorzugter_bereich: "Finanzbuchhaltung und Jahresabschlüsse",
      anzahl_ag_5_jahre: "1",
      aktuelle_steuerkanzlei: "Ja",
      kanzleigroesse: "ca. 15 Mitarbeitende",
      betreute_branchen: "Handwerk, Gastronomie, Freiberufler",
      datev_erfahrung: "Ja, mehrjährig",
      alter: "29",
      wohnort_plz: target.plz ?? "",
      gehaltsvorstellung: "ca. 3.400 € brutto/Monat",
    },
  }
}

// Legt den Demo-Kandidaten an und ordnet ihn dem Kunden zu - nur, wenn der Kunde noch
// keinen hat. Fehler werden geloggt, nicht geworfen: die Kundenanlage darf daran nicht
// scheitern.
export async function createDemoCandidateForClient(db: SupabaseClient<Database>, clientId: string, createdBy?: string | null): Promise<string | null> {
  try {
    const { data: existing } = await db
      .from("client_assignments")
      .select("id, candidates!inner(is_demo)")
      .eq("client_id", clientId)
      .eq("candidates.is_demo", true)
      .limit(1)
    if (existing && existing.length > 0) return null

    const [{ data: client }, { data: positions }] = await Promise.all([
      db.from("clients").select("plz").eq("id", clientId).single(),
      db.from("client_positions").select("berufsbild, plz, sort_order, created_at").eq("client_id", clientId),
    ])
    const target = pickDemoTarget(positions ?? [], client?.plz ?? null)
    const { data: candidate, error } = await db.from("candidates").insert(buildDemoCandidate(target)).select("id").single()
    if (error) throw new Error(error.message)

    // Beispielkampagne (Paket 18, T-82), in der der Beispiel-Lead liegt - so sieht der
    // Kunde im Gespräch und im Portal, wie Kampagne und Kandidat zusammengehören.
    const coords = target.plz ? geocodePlz(target.plz) : null
    const label = BERUFSBILD_OPTIONS.find((o) => o.value === target.berufsbild)?.label ?? "Steuerfachangestellte"
    const { data: campaign, error: campaignError } = await db
      .from("campaigns")
      .insert({
        title: `Beispielkampagne – ${label} (m/w/d)`,
        client_id: clientId,
        kind: "kanzlei",
        status: "active",
        is_demo: true,
        berufsbild: target.berufsbild,
        plz: target.plz,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        description: "Beispielkampagne zum Vorführen – keine echte Kampagne.",
      })
      .select("id")
      .single()
    if (campaignError) throw new Error(campaignError.message)

    const { error: assignError } = await db
      .from("client_assignments")
      .insert({ candidate_id: candidate.id, client_id: clientId, campaign_id: campaign.id, created_by: createdBy ?? null })
    if (assignError) throw new Error(assignError.message)
    return candidate.id
  } catch (err) {
    console.error("Beispiel-Lead konnte nicht angelegt werden:", err instanceof Error ? err.message : err)
    return null
  }
}
