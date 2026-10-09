// Musterdatensätze per KI (Paket 41): drei fiktive, vorqualifizierte Kandidaten eines
// Berufsbilds rund um eine PLZ (Wohnorte im Umkreis von 15 km), getaggt als
// "Musterdatensatz" - zum Vorführen beim Kunden. Aufbau wie die 12 Musterkandidaten aus
// Paket 28 (Beschreibung, offene Fragen, Zusatzfelder).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { geocodePlz, plzWithin } from "@/lib/geocode-plz"
import { generateText } from "@/lib/llm"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { matchCandidateToCampaigns } from "@/lib/matching"

export const SAMPLE_COUNT = 3
export const SAMPLE_RADIUS_KM = 15

const FIELD_KEYS = [
  "ausbildung",
  "alter",
  "verfuegbar_ab",
  "wechselgrund",
  "erwartungen_neuer_ag",
  "bevorzugter_bereich",
  "betreute_branchen",
  "datev_erfahrung",
  "anzahl_ag_5_jahre",
  "aktuelle_steuerkanzlei",
  "kanzleigroesse",
  "gehaltsvorstellung",
  "erreichbarkeit",
] as const

export interface SamplePerson {
  plz: string
  geschlecht: "weiblich" | "männlich"
}

export interface SampleCandidate {
  first_name: string
  last_name: string
  beschreibung: string
  offene_fragen: string
  felder: Partial<Record<(typeof FIELD_KEYS)[number], string>>
}

// Drei Wohnorte im Umkreis (gern verschiedene PLZ) und je zufällig weiblich/männlich.
export function pickSamplePeople(plz: string, random: () => number = Math.random): SamplePerson[] {
  const center = geocodePlz(plz)
  if (!center) throw new Error(`PLZ ${plz} ist unbekannt.`)
  const pool = plzWithin(center.lat, center.lng, SAMPLE_RADIUS_KM).filter((p) => p !== plz)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return Array.from({ length: SAMPLE_COUNT }, (_, i) => ({
    plz: pool[i] ?? plz,
    geschlecht: random() < 0.5 ? "weiblich" : "männlich",
  }))
}

export function buildSamplePrompt(berufsbildLabel: string, people: SamplePerson[]): string {
  return [
    `Erstelle ${people.length} fiktive, realistische Bewerberprofile für die Stelle "${berufsbildLabel} (m/w/d)" in einer deutschen Steuerkanzlei.`,
    "Personen:",
    ...people.map((p, i) => `${i + 1}. ${p.geschlecht}, wohnt in PLZ ${p.plz}`),
    "",
    "Regeln:",
    "- Erfundene, gängige deutsche Vor- und Nachnamen passend zum Geschlecht, keine bekannten Personen.",
    `- Werdegang und Erfahrung passen zum Berufsbild ${berufsbildLabel}; die drei Profile unterscheiden sich deutlich (Alter, Erfahrung, Schwerpunkt, Wechselgrund).`,
    "- beschreibung: 2-3 Sätze Kurzprofil aus Sicht des Recruiters, sachlich.",
    '- offene_fragen: 2-3 Fragen des Kandidaten an den neuen Arbeitgeber, je Zeile mit "- ".',
    "- felder: ausbildung (mit Jahr), alter (Zahl), verfuegbar_ab, wechselgrund, erwartungen_neuer_ag, bevorzugter_bereich, betreute_branchen, datev_erfahrung, anzahl_ag_5_jahre (Zahl), aktuelle_steuerkanzlei (Ja/Nein), kanzleigroesse, gehaltsvorstellung (Jahresbrutto in €), erreichbarkeit.",
    "",
    'Antworte nur mit JSON: {"kandidaten": [{"first_name": "", "last_name": "", "beschreibung": "", "offene_fragen": "", "felder": {}}]} in der Reihenfolge der Personen.',
  ].join("\n")
}

export function parseSampleAnswer(text: string, count: number): SampleCandidate[] {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("KI-Antwort enthält kein JSON.")
  const list = (JSON.parse(match[0]) as { kandidaten?: unknown }).kandidaten
  if (!Array.isArray(list) || list.length < count) throw new Error("KI-Antwort enthält zu wenige Kandidaten.")
  return list.slice(0, count).map((raw) => {
    const r = raw as Record<string, unknown>
    const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "")
    const felderRaw = (r.felder ?? {}) as Record<string, unknown>
    const felder = Object.fromEntries(FIELD_KEYS.map((k) => [k, str(felderRaw[k])]).filter(([, v]) => v))
    if (!str(r.first_name) || !str(r.last_name)) throw new Error("KI-Antwort ohne Namen.")
    return { first_name: str(r.first_name), last_name: str(r.last_name), beschreibung: str(r.beschreibung), offene_fragen: str(r.offene_fragen), felder }
  })
}

// "Jürgen Müller-Weiß" -> "juergen.mueller-weiss@example.com" (reservierte Domain, kein echtes Postfach).
export function sampleEmail(first: string, last: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[^a-z0-9-]+/g, "")
  return `${slug(first)}.${slug(last)}@example.com`
}

export async function createSampleCandidates(
  db: SupabaseClient<Database>,
  input: { berufsbild: string; plz: string },
  createdBy: string | null
): Promise<string[]> {
  // Alle aktiven Berufsbilder außer "Sonstige" (pflegbar, Paket 45).
  const option = (await fetchBerufsbilder(db)).find((o) => o.value === input.berufsbild && o.value !== "sonstige" && o.active !== false)
  if (!option) throw new Error("Bitte ein Berufsbild wählen.")
  const people = pickSamplePeople(input.plz)
  const answer = await generateText({
    tier: "smart",
    system: "Du erstellst fiktive Beispieldaten für eine Recruiting-Software für Steuerkanzleien. Alle Personen sind frei erfunden.",
    prompt: buildSamplePrompt(option.label, people),
    maxTokens: 4000,
    timeoutMs: 120_000,
  })
  const samples = parseSampleAnswer(answer, people.length)

  const ids: string[] = []
  for (const [i, s] of samples.entries()) {
    const coords = geocodePlz(people[i].plz)
    const { data, error } = await db
      .from("candidates")
      .insert({
        first_name: s.first_name,
        last_name: s.last_name,
        email: sampleEmail(s.first_name, s.last_name),
        phone: `+49 30 23125 ${200 + Math.floor(Math.random() * 800)}`,
        status: "vorqualifiziert",
        source: "manual",
        berufsbild: option.value,
        plz: people[i].plz,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        notes: s.beschreibung || null,
        offene_fragen: s.offene_fragen || null,
        custom_fields: s.felder,
        tags: [SAMPLE_TAG],
      })
      .select("id")
      .single()
    if (error) throw new Error(error.message)
    ids.push(data.id)
    await db.from("candidate_history").insert({ candidate_id: data.id, type: "note", content: "Musterdatensatz per KI erstellt.", created_by: createdBy })
    await matchCandidateToCampaigns(db, data.id).catch((e) => console.error("Matching Musterdatensatz:", e))
  }
  return ids
}
