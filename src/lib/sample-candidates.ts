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
  // "passend zum Namen" beim Überarbeiten mit vorgegebenem Namen (Paket 71).
  geschlecht: "weiblich" | "männlich" | "passend zum Namen"
  herkunft: string
  software: SampleSoftware
  // Allrounder (Paket 62): Erfahrung in allen Bereichen.
  allrounder: boolean
  // Vorgegebener Name (Paket 71: vorhandene Musterdatensätze überarbeiten).
  name?: string
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

// Qualifikation je Berufsbild (Paket 71): Die Person hat sie heute bereits - ein
// "Steuerberater" ist bestellt, kein Steuerfachangestellter mit Fortbildungsplänen.
export type QualificationKind = "steuerberater" | "steuerfachwirt" | "bilanzbuchhalter" | "lohnbuchhalter" | "finanzbuchhalter" | "steuerfachangestellte" | "sonstige"

export function qualificationKind(berufsbild: string): QualificationKind {
  const b = berufsbild.toLowerCase()
  if (/steuerberater/.test(b)) return "steuerberater"
  if (/steuerfachwirt/.test(b)) return "steuerfachwirt"
  if (/bilanzbuchhalter/.test(b)) return "bilanzbuchhalter"
  if (/lohn/.test(b)) return "lohnbuchhalter"
  if (/finanzbuchhalter|fibu/.test(b)) return "finanzbuchhalter"
  if (/steuerfachangestellte/.test(b)) return "steuerfachangestellte"
  return "sonstige"
}

function qualificationRule(kind: QualificationKind, label: string): string {
  switch (kind) {
    case "steuerberater":
      return 'Alle sind heute bereits bestellte Steuerberater:innen: Steuerberaterprüfung bestanden und bestellt (mit Jahr, mindestens ein Jahr zurück). Realistischer Weg dorthin, z. B. Steuerfachangestellte:r -> Steuerfachwirt:in -> Steuerberaterexamen oder Studium (BWL/Steuern) -> Steuerberaterexamen. Aktuelle Position: angestellte:r Steuerberater:in in einer Steuerkanzlei. Mindestens 30 Jahre alt. Keine laufenden oder geplanten Prüfungen.'
    case "steuerfachwirt":
      return "Alle sind heute bereits geprüfte Steuerfachwirt:innen: Ausbildung zur/zum Steuerfachangestellten abgeschlossen und Fortbildungsprüfung zum Steuerfachwirt bestanden (beide mit Jahr, Steuerfachwirt mindestens ein Jahr zurück). Aktuelle Position: Steuerfachwirt:in. Keine laufende oder geplante Prüfung."
    case "bilanzbuchhalter":
      return "Alle sind heute bereits geprüfte Bilanzbuchhalter:innen (IHK, mit Jahr, mindestens ein Jahr zurück), vorher Ausbildung zur/zum Steuerfachangestellten; Schwerpunkt Jahresabschlüsse. Aktuelle Position: Bilanzbuchhalter:in in einer Steuerkanzlei. Keine laufende oder geplante Prüfung."
    case "lohnbuchhalter":
      return "Alle sind heute bereits qualifizierte Lohnbuchhalter:innen: abgeschlossene Ausbildung zur/zum Steuerfachangestellten (oder geprüfte Fachkraft Lohn und Gehalt) und mehrere Jahre Lohnbuchhaltung in Steuerkanzleien. Aktuelle Position: Lohnbuchhalter:in. Eine Fortbildung zum Steuerfachwirt darf geplant sein, nie zum Bilanzbuchhalter."
    case "finanzbuchhalter":
      return "Alle sind heute bereits qualifizierte Finanzbuchhalter:innen: abgeschlossene Ausbildung zur/zum Steuerfachangestellten (oder geprüfte:r Finanzbuchhalter:in IHK) und mehrere Jahre Finanzbuchhaltung in Steuerkanzleien. Aktuelle Position: Finanzbuchhalter:in. Eine Fortbildung zum Steuerfachwirt darf geplant sein, nie zum Bilanzbuchhalter."
    case "steuerfachangestellte":
      return "Alle haben die Ausbildung zur/zum Steuerfachangestellten heute bereits abgeschlossen (mit Jahr) und arbeiten seitdem als Steuerfachangestellte:r. Eine Fortbildung zum Steuerfachwirt darf geplant sein, nie zum Bilanzbuchhalter."
    default:
      return `Alle haben die Qualifikation "${label}" heute bereits abgeschlossen (mit Jahr) und arbeiten aktuell als ${label}.`
  }
}

// Prüft einen erzeugten Musterdatensatz (Paket 71): Werdegang vorhanden, Qualifikation des
// Berufsbilds heute erreicht. Liefert die Probleme (leer = in Ordnung).
const PLANNED = /geplant|angestrebt|in vorbereitung|läuft|laufend|voraussichtlich|berufsbegleitend|derzeit in|bereitet sich/i
export function sampleProblems(s: Pick<SampleCandidate, "werdegang" | "felder">, berufsbild: string): string[] {
  const problems: string[] = []
  const werdegang = s.werdegang?.trim() ?? ""
  if (!werdegang || !/·/.test(werdegang)) problems.push("ohne Werdegang")
  const ausbildung = String(s.felder?.ausbildung ?? "")
  const strict: Partial<Record<QualificationKind, RegExp>> = {
    steuerberater: /steuerberater/i,
    steuerfachwirt: /steuerfachwirt/i,
    bilanzbuchhalter: /bilanzbuchhalter/i,
  }
  const need = strict[qualificationKind(berufsbild)]
  if (need) {
    if (!need.test(ausbildung)) problems.push("Qualifikation fehlt in der Ausbildung")
    else if (PLANNED.test(ausbildung)) problems.push("Qualifikation erst geplant")
    const current = werdegang.split("\n")[0] ?? ""
    if (werdegang && !need.test(current)) problems.push("aktuelle Station passt nicht")
  }
  return problems
}

export function buildSamplePrompt(berufsbildLabel: string, people: SamplePerson[], opts: SampleOptions = {}, year = new Date().getFullYear(), berufsbildKey?: string): string {
  const focus = opts.focus ?? []
  const extra = opts.extra?.trim() ?? ""
  const avoid = opts.avoidNames ?? []
  return [
    `Erstelle ${people.length} fiktive, realistische Bewerberprofile für die Stelle "${berufsbildLabel} (m/w/d)" in einer deutschen Steuerkanzlei.`,
    "Personen:",
    ...people.map(
      (p, i) =>
        `${i + 1}. ${p.name ? `Name: ${p.name} (genau so übernehmen), ` : ""}${p.geschlecht}, wohnt in PLZ ${p.plz}, Namensherkunft: ${p.herkunft}, Kanzleisoftware: ${p.software}${p.allrounder ? ", Allrounder" : ""}`
    ),
    "",
    "Regeln:",
    "- Erfundene Vor- und Nachnamen passend zu Geschlecht und Namensherkunft, so wie sie in Deutschland vorkommen (auch Doppelnamen oder gemischte Namen sind möglich). Keine bekannten Personen, keine Allerweltskombinationen wie Max Müller.",
    ...(avoid.length ? [`- Diese Namen sind schon vergeben, nicht wiederholen: ${avoid.join(", ")}.`] : []),
    "- Alle haben ihre Ausbildung in einer deutschen Steuerkanzlei gemacht und ausschließlich in Steuerkanzleien gearbeitet - keine Industrie, keine Unternehmen, keine Buchhaltungsabteilungen.",
    "- Keine Branchen nennen: Die Mandanten sind querbeet gemischt, ohne Branchenschwerpunkt.",
    `- Werdegang und Erfahrung passen zum Berufsbild ${berufsbildLabel}; die Profile unterscheiden sich deutlich (Alter, Berufsjahre, Kanzleigröße, Wechselgrund).`,
    `- Qualifikation: ${qualificationRule(qualificationKind(berufsbildKey ?? berufsbildLabel), berufsbildLabel)}`,
    "- Alter, Ausbildungsjahre und Werdegang passen zusammen (Ausbildungsbeginn mit etwa 16 bis 22 Jahren).",
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
    '- felder: ausbildung (alle abgeschlossenen Abschlüsse mit Jahr, der höchste zuletzt, z. B. "Steuerfachangestellte 2012, Steuerfachwirtin 2016"), alter (Zahl), verfuegbar_ab, wechselgrund, erwartungen_neuer_ag, bevorzugter_bereich, datev_erfahrung, anzahl_ag_5_jahre (Zahl), aktuelle_steuerkanzlei ("Ja"), kanzleigroesse, gehaltsvorstellung (Jahresbrutto in €), erreichbarkeit.',
    `- werdegang: lückenloser beruflicher Werdegang der letzten zehn Jahre (${year - 10} bis heute; bei Jüngeren ab Ausbildungsbeginn), neueste Station zuerst, nur Steuerkanzleien (einschließlich Ausbildung). Je Station eine Kopfzeile "MM/JJJJ – MM/JJJJ · Position · Steuerkanzlei, ca. N Mitarbeitende" (aktuelle Station "MM/JJJJ – heute"), darunter 3-5 typische Aufgaben je Zeile mit "- ", zwischen den Stationen eine Leerzeile. Die aktuelle Station zeigt die heutige Position ${berufsbildLabel}; Abschlüsse bzw. Bestellung im passenden Jahr. Keine Kanzleinamen, keine Orte, keine Branchen.`,
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

// KI-Aufruf für mehrere Personen desselben Berufsbilds. Jeder Datensatz wird geprüft
// (Paket 71); unpassende werden bis zu zweimal neu erzeugt, danach weggelassen.
export async function generateSamples(
  berufsbild: { value: string; label: string },
  people: SamplePerson[],
  opts: SampleOptions = {}
): Promise<{ person: SamplePerson; sample: SampleCandidate }[]> {
  const done: { person: SamplePerson; sample: SampleCandidate }[] = []
  let open = people
  for (let attempt = 0; attempt < 3 && open.length > 0; attempt++) {
    const answer = await generateText({
      tier: "smart",
      system: "Du erstellst fiktive Beispieldaten für eine Recruiting-Software für Steuerkanzleien. Alle Personen sind frei erfunden.",
      prompt: buildSamplePrompt(berufsbild.label, open, opts, undefined, berufsbild.value),
      maxTokens: 2500 + open.length * 1800,
      timeoutMs: 180_000,
    })
    const samples = parseSampleAnswer(answer, open.length)
    const retry: SamplePerson[] = []
    samples.forEach((sample, i) => {
      if (sampleProblems(sample, berufsbild.value).length === 0) done.push({ person: open[i], sample })
      else retry.push(open[i])
    })
    open = retry
  }
  return done
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
  const samples = await generateSamples(option, people, { focus, extra: input.extra })
  if (samples.length === 0) throw new Error("Die KI hat keine passenden Profile geliefert - bitte noch einmal versuchen.")
  const ids: string[] = []
  for (const { person, sample } of samples) ids.push(await insertSampleCandidate(db, sample, person, option.value, createdBy))
  return ids
}
