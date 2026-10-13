// Musterdatensätze per KI (Paket 41): drei fiktive, vorqualifizierte Kandidaten eines
// Berufsbilds rund um eine PLZ (Wohnorte im Umkreis von 15 km), getaggt als
// "Musterdatensatz" - zum Vorführen beim Kunden. Aufbau wie die 12 Musterkandidaten aus
// Paket 28 (Beschreibung, offene Fragen, Zusatzfelder), seit Paket 62 mit Werdegang,
// vielfältigen Namen, Kanzleisoftware und Allroundern. Musterdatensätze werden nicht
// gematcht und lassen sich keiner Kanzlei zuordnen.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { geocodePlz, plzWithin } from "@/lib/geocode-plz"
import { generateText } from "@/lib/llm"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { cleanWerdegang } from "@/lib/cv-werdegang"
import { SAMPLE_FOCUS_OPTIONS, type SampleSoftware } from "@/lib/sample-focus"

export const SAMPLE_COUNT = 3
export const SAMPLE_RADIUS_KM = 15

const FIELD_KEYS = [
  "ausbildung",
  "alter",
  "verfuegbar_ab",
  "wechselgrund",
  "erwartungen_neuer_ag",
  "bevorzugter_bereich",
  "datev_erfahrung",
  "anzahl_ag_5_jahre",
  "aktuelle_steuerkanzlei",
  "kanzleigroesse",
  "gehaltsvorstellung",
  "erreichbarkeit",
] as const

// Namensherkunft je Person, grob nach der Bevölkerung in Deutschland (gut ein Viertel mit
// Einwanderungsgeschichte) - ohne Vorgabe erfindet die KI fast nur deutsche Namen.
export const NAME_ORIGINS: readonly [string, number][] = [
  ["deutsch", 63],
  ["türkisch", 7],
  ["polnisch", 4],
  ["russlanddeutsch oder russisch", 4],
  ["kroatisch, serbisch oder bosnisch", 3],
  ["arabisch (z. B. syrisch, libanesisch, irakisch)", 3],
  ["italienisch", 2.5],
  ["deutscher Vorname, Nachname mit Einwanderungsgeschichte", 2.5],
  ["griechisch", 1.5],
  ["rumänisch", 1.5],
  ["albanisch oder kosovarisch", 1.5],
  ["ukrainisch", 1.5],
  ["persisch oder afghanisch", 1.5],
  ["kurdisch", 1],
  ["vietnamesisch", 1],
  ["portugiesisch oder spanisch", 1],
]

export function pickNameOrigin(random: () => number = Math.random): string {
  const total = NAME_ORIGINS.reduce((s, [, w]) => s + w, 0)
  let r = random() * total
  for (const [origin, weight] of NAME_ORIGINS) {
    r -= weight
    if (r < 0) return origin
  }
  return NAME_ORIGINS[0][0]
}

export interface SamplePerson {
  plz: string
  geschlecht: "weiblich" | "männlich"
  herkunft: string
  software: SampleSoftware
  // Allrounder (Paket 62): Erfahrung in allen Bereichen.
  allrounder: boolean
}

export interface SampleCandidate {
  first_name: string
  last_name: string
  beschreibung: string
  offene_fragen: string
  werdegang: string
  felder: Partial<Record<(typeof FIELD_KEYS)[number], string>>
}

export interface SampleOptions {
  focus?: string[]
  extra?: string
  // Schon vergebene Namen - die KI soll sie nicht wiederholen.
  avoidNames?: string[]
}

// Drei Wohnorte im Umkreis (gern verschiedene PLZ), je zufällig weiblich/männlich und mit
// eigener Namensherkunft.
export function pickSamplePeople(
  plz: string,
  opts: { software?: SampleSoftware; allrounder?: boolean } = {},
  random: () => number = Math.random
): SamplePerson[] {
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
    herkunft: pickNameOrigin(random),
    software: opts.software ?? "DATEV",
    allrounder: opts.allrounder ?? false,
  }))
}

const SOFTWARE_HINT: Record<SampleSoftware, string> = {
  DATEV: "DATEV (Kanzlei-Rechnungswesen, Lohn und Gehalt bzw. LODAS, Jahresabschluss) und immer auch DATEV Unternehmen online",
  ADDISON: "ADDISON (Wolters Kluwer)",
  Agenda: "Agenda",
}

export function buildSamplePrompt(berufsbildLabel: string, people: SamplePerson[], opts: SampleOptions = {}, year = new Date().getFullYear()): string {
  const focus = opts.focus ?? []
  const extra = opts.extra?.trim() ?? ""
  const avoid = opts.avoidNames ?? []
  return [
    `Erstelle ${people.length} fiktive, realistische Bewerberprofile für die Stelle "${berufsbildLabel} (m/w/d)" in einer deutschen Steuerkanzlei.`,
    "Personen:",
    ...people.map(
      (p, i) =>
        `${i + 1}. ${p.geschlecht}, wohnt in PLZ ${p.plz}, Namensherkunft: ${p.herkunft}, Kanzleisoftware: ${p.software}${p.allrounder ? ", Allrounder" : ""}`
    ),
    "",
    "Regeln:",
    "- Erfundene Vor- und Nachnamen passend zu Geschlecht und Namensherkunft, so wie sie in Deutschland vorkommen (auch Doppelnamen oder gemischte Namen sind möglich). Keine bekannten Personen, keine Allerweltskombinationen wie Max Müller.",
    ...(avoid.length ? [`- Diese Namen sind schon vergeben, nicht wiederholen: ${avoid.join(", ")}.`] : []),
    "- Alle haben ihre Ausbildung in einer deutschen Steuerkanzlei gemacht und ausschließlich in Steuerkanzleien gearbeitet - keine Industrie, keine Unternehmen, keine Buchhaltungsabteilungen.",
    "- Keine Branchen nennen: Die Mandanten sind querbeet gemischt, ohne Branchenschwerpunkt.",
    `- Werdegang und Erfahrung passen zum Berufsbild ${berufsbildLabel}; die Profile unterscheiden sich deutlich (Alter, Berufsjahre, Kanzleigröße, Wechselgrund).`,
    "- Fortbildungen (geplant oder abgeschlossen) immer zum Steuerfachwirt, nie zum Bilanzbuchhalter.",
    `- Kanzleisoftware: Die angegebene Software zieht sich durch datev_erfahrung, Beschreibung und Werdegang. DATEV heißt: ${SOFTWARE_HINT.DATEV}. Bei ${SOFTWARE_HINT.ADDISON} oder Agenda steht in datev_erfahrung, dass die Person damit arbeitet und offen für DATEV ist.`,
    ...(people.some((p) => p.allrounder)
      ? [
          `- Allrounder haben Erfahrung in allen Bereichen (${SAMPLE_FOCUS_OPTIONS.join(", ")}) - zwingend sichtbar in bevorzugter_bereich (beginnt mit "Allrounder:"), in der Beschreibung und im Werdegang.`,
        ]
      : []),
    // Gewählte Schwerpunkte (Paket 57): prägen bevorzugten Bereich, Beschreibung und Erfahrung.
    ...(focus.length
      ? [
          `- Fachliche Schwerpunkte: ${focus.join(", ")}. Jedes Profil hat seinen Schwerpunkt in ${focus.length > 1 ? "diesen Bereichen (unterschiedlich gewichtet, zusammen alle abgedeckt)" : "diesem Bereich"} - sichtbar in bevorzugter_bereich, beschreibung und Erfahrung.`,
        ]
      : []),
    ...(extra ? [`- Zusätzliche Vorgaben des Vertriebs (unbedingt berücksichtigen): ${extra}`] : []),
    // Ohne Namen - sonst stünde er im anonymisierten Modus trotzdem in der Beschreibung.
    '- beschreibung: 2-3 Sätze Kurzprofil aus Sicht des Recruiters, sachlich, ohne den Namen der Person (z. B. "Steuerfachangestellte, 29 Jahre, ...").',
    '- offene_fragen: 2-3 Fragen des Kandidaten an den neuen Arbeitgeber, je Zeile mit "- ".',
    '- felder: ausbildung (mit Jahr), alter (Zahl), verfuegbar_ab, wechselgrund, erwartungen_neuer_ag, bevorzugter_bereich, datev_erfahrung, anzahl_ag_5_jahre (Zahl), aktuelle_steuerkanzlei ("Ja"), kanzleigroesse, gehaltsvorstellung (Jahresbrutto in €), erreichbarkeit.',
    `- werdegang: beruflicher Werdegang der letzten zehn Jahre (${year - 10} bis heute), neueste Station zuerst, nur Steuerkanzleien (einschließlich Ausbildung). Je Station eine Kopfzeile "Zeitraum · Position · Steuerkanzlei, ca. N Mitarbeitende", darunter 3-5 typische Aufgaben je Zeile mit "- ", zwischen den Stationen eine Leerzeile. Keine Kanzleinamen, keine Orte, keine Branchen.`,
    "",
    'Antworte nur mit JSON: {"kandidaten": [{"first_name": "", "last_name": "", "beschreibung": "", "offene_fragen": "", "werdegang": "", "felder": {}}]} in der Reihenfolge der Personen.',
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
    return {
      first_name: str(r.first_name),
      last_name: str(r.last_name),
      beschreibung: str(r.beschreibung),
      offene_fragen: str(r.offene_fragen),
      werdegang: cleanWerdegang(str(r.werdegang)),
      felder,
    }
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

// Ein KI-Aufruf für mehrere Personen desselben Berufsbilds.
export async function generateSamples(berufsbildLabel: string, people: SamplePerson[], opts: SampleOptions = {}): Promise<SampleCandidate[]> {
  const answer = await generateText({
    tier: "smart",
    system: "Du erstellst fiktive Beispieldaten für eine Recruiting-Software für Steuerkanzleien. Alle Personen sind frei erfunden.",
    prompt: buildSamplePrompt(berufsbildLabel, people, opts),
    maxTokens: 2500 + people.length * 1800,
    timeoutMs: 180_000,
  })
  return parseSampleAnswer(answer, people.length)
}

export async function insertSampleCandidate(
  db: SupabaseClient<Database>,
  sample: SampleCandidate,
  person: SamplePerson,
  berufsbild: string,
  createdBy: string | null,
  coords: { lat: number; lng: number } | null = geocodePlz(person.plz)
): Promise<string> {
  const { data, error } = await db
    .from("candidates")
    .insert({
      first_name: sample.first_name,
      last_name: sample.last_name,
      email: sampleEmail(sample.first_name, sample.last_name),
      phone: `+49 30 23125 ${200 + Math.floor(Math.random() * 800)}`,
      status: "vorqualifiziert",
      source: "manual",
      berufsbild,
      plz: person.plz,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      notes: sample.beschreibung || null,
      offene_fragen: sample.offene_fragen || null,
      cv_werdegang: sample.werdegang || null,
      custom_fields: sample.felder,
      tags: [SAMPLE_TAG],
    })
    .select("id")
    .single()
  if (error) throw new Error(error.message)
  await db.from("candidate_history").insert({ candidate_id: data.id, type: "note", content: "Musterdatensatz per KI erstellt.", created_by: createdBy })
  return data.id
}

export async function createSampleCandidates(
  db: SupabaseClient<Database>,
  input: { berufsbild: string; plz: string; focus?: string[]; allrounder?: boolean; software?: SampleSoftware; extra?: string },
  createdBy: string | null
): Promise<string[]> {
  // Alle aktiven Berufsbilder außer "Sonstige" (pflegbar, Paket 45).
  const option = (await fetchBerufsbilder(db)).find((o) => o.value === input.berufsbild && o.value !== "sonstige" && o.active !== false)
  if (!option) throw new Error("Bitte ein Berufsbild wählen.")
  const people = pickSamplePeople(input.plz, { software: input.software, allrounder: input.allrounder })
  // Allrounder decken zwingend alle Bereiche ab (eigene Regel im Auftrag), dann ohne Schwerpunkte.
  const focus = input.allrounder ? [] : (input.focus ?? [])
  const samples = await generateSamples(option.label, people, { focus, extra: input.extra })
  const ids: string[] = []
  for (const [i, s] of samples.entries()) ids.push(await insertSampleCandidate(db, s, people[i], option.value, createdBy))
  return ids
}
