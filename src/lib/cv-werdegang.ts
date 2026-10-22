// Werdegang für den Lebenslauf per KI (Paket 43): formuliert aus den Angaben eines
// Kandidaten die Stationen der letzten zehn Jahre und reichert sie um die typischen
// Aufgaben des Berufsbilds an, damit der Lebenslauf (vollständig wie anonymisiert)
// aussagekräftig ist. Erfunden wird nichts Überprüfbares: keine Arbeitgebernamen, keine
// Abschlüsse, keine genauen Daten, die nicht in den Angaben stehen.
//
// Paket 82: Quelle sind nur die Angaben (Beschreibung/Notizen, Zusatzfelder) - nicht mehr
// der zuvor erzeugte Werdegang, sonst hielten sich alte Vermutungen, wenn das Team die
// Stationen später in die Beschreibung schreibt. Ändern sich die Angaben, erstellt die
// Lebenslauf-Ansicht den Werdegang neu (cv_werdegang_input = Prüfsumme der Angaben).
// Je Station steht der Arbeitgeber zweimal in der Kopfzeile: neutral für den anonymisierten
// Lebenslauf und - wenn genannt - mit Namen und Ort für den vollständigen ("… ‖ …").
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { BERUFSBILD_OPTIONS, berufsbildLabel, type BerufsbildOption } from "@/lib/berufsbild"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { generateText } from "@/lib/llm"

export interface WerdegangInput {
  berufsbild: string | null
  custom_fields: Record<string, unknown> | null
  notes: string | null
}

// Trennzeichen zwischen neutralem Arbeitgeber und Arbeitgeber mit Namen in der Kopfzeile.
const NAMED_SEPARATOR = "‖"
const NOTES_LIMIT = 8000

const FIELDS: [string, string][] = [
  ["ausbildung", "Ausbildung / Qualifikation"],
  ["alter", "Alter"],
  ["bevorzugter_bereich", "Bevorzugte Tätigkeitsbereiche"],
  ["betreute_branchen", "Betreute Branchen"],
  ["datev_erfahrung", "DATEV-Erfahrung"],
  ["aktuelle_steuerkanzlei", "Derzeit in einer Steuerkanzlei tätig"],
  ["kanzleigroesse", "Größe der aktuellen Kanzlei"],
  ["anzahl_ag_5_jahre", "Arbeitgeber in den letzten 5 Jahren"],
  ["weitere_antworten", "Weitere Antworten aus der Bewerbung"],
]

// Kontaktdaten gehen nicht an die KI.
function mask(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[E-Mail]").replace(/(?:\+|\b0)\d[\d ()/-]{6,}\d/g, "[Telefon]")
}

export function buildWerdegangPrompt(c: WerdegangInput, year = new Date().getFullYear(), berufsbilder: BerufsbildOption[] = BERUFSBILD_OPTIONS): string {
  const berufsbild = berufsbildLabel(c.berufsbild, berufsbilder) ?? "unbekannt"
  const cf = c.custom_fields ?? {}
  const facts = FIELDS.map(([k, label]) => [label, typeof cf[k] === "string" || typeof cf[k] === "number" ? String(cf[k]).trim() : ""])
    .filter(([, v]) => v)
    .map(([label, v]) => `${label}: ${mask(v)}`)
  return [
    `Erstelle den Abschnitt "Beruflicher Werdegang" für den Lebenslauf eines Bewerbers (Berufsbild: ${berufsbild}). Zeitraum: die letzten zehn Jahre (${year - 10} bis heute).`,
    "",
    "Angaben zum Bewerber:",
    ...(facts.length ? facts : ["(keine Zusatzangaben)"]),
    c.notes?.trim()
      ? `\nBeschreibung und Notizen des Recruiters (enthalten oft eine Liste der Stationen - die ist die wichtigste Quelle; sonst nur Fakten zum Werdegang verwenden):\n${mask(c.notes.trim()).slice(0, NOTES_LIMIT)}`
      : "",
    "",
    "Regeln:",
    "- Übernimm ALLE Stationen der letzten zehn Jahre aus den Angaben vollständig, mit Zeitraum (MM/JJJJ, wie angegeben), Position und Arbeitgeber - auch kurze Stationen, Auszeiten und fachfremde Tätigkeiten. Erfinde keine weiteren Stationen, Abschlüsse oder Zertifikate.",
    "- Stehen widersprüchliche Angaben in den Notizen, gilt die neuere (Einträge sind meist mit Datum versehen, neueste oben).",
    `- Arbeitgeber in der Kopfzeile zweimal, getrennt durch " ${NAMED_SEPARATOR} ": zuerst neutral ohne Namen und ohne Ort unterhalb der Region (z. B. "Steuerkanzlei, ca. 15 Mitarbeitende"; bekannte Größe nennen), danach so, wie er in den Angaben steht (Name und Ort, z. B. "Steuerkanzlei Maus, Merzenich"). Steht kein Name in den Angaben, entfällt der zweite Teil samt Trennzeichen.`,
    "- Private Auszeiten neutral benennen (z. B. \"Familiäre Auszeit\") ohne Details zu Gesundheit oder Angehörigen; dazu höchstens 1 bis 2 sachliche Stichpunkte.",
    "- Keine Personennamen, keine Kontaktdaten.",
    "- Jahreszahlen nur, wenn sie in den Angaben stehen oder sich eindeutig ergeben; sonst ohne Zeitraum oder mit \"aktuell\".",
    `- Ergänze je Berufsstation 3 bis 6 Aufgaben, die in dieser Position typischerweise anfallen - passend zur jeweiligen Position (bei fachfremden Stationen deren Aufgaben, nicht die einer Steuerkanzlei), zum Berufsbild ${berufsbild} und zu genannten Schwerpunkten, Branchen und Software. Genannte Tätigkeiten haben Vorrang.`,
    "- Gibt es keine erkennbaren Stationen: eine Station für die aktuelle bzw. letzte Tätigkeit laut Ausbildung und Berufsbild.",
    "- Fachfremde Bewerber (z. B. Bürokaufleute) nicht zu Steuerfachkräften machen - ihren tatsächlichen Hintergrund beschreiben.",
    "- Neueste Station zuerst. Sachlich, in der dritten Person ohne Pronomen, Stichpunkte.",
    "",
    "Format (nur Text, kein Markdown, keine Einleitung):",
    `Zeitraum · Position · Arbeitgeber neutral ${NAMED_SEPARATOR} Arbeitgeber mit Name und Ort`,
    "- Aufgabe",
    "- Aufgabe",
    "(Leerzeile zwischen den Stationen)",
  ]
    .filter((l) => l !== "")
    .join("\n")
    .replace("\nRegeln:", "\n\nRegeln:")
    .replace("\nFormat", "\n\nFormat")
}

// Text der KI bereinigen: Markdown-Reste entfernen, Aufzählungszeichen vereinheitlichen.
export function cleanWerdegang(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[•*–]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export interface WerdegangStation {
  heading: string
  tasks: string[]
}

// Kopfzeile für die jeweilige Variante: anonymisiert der neutrale Arbeitgeber, vollständig
// der mit Namen (falls vorhanden). Ältere Werdegänge ohne "‖" bleiben, wie sie sind.
export function stationHeading(line: string, anonym: boolean): string {
  const [neutral, named] = line.split(NAMED_SEPARATOR).map((s) => s.trim())
  if (anonym || !named) return neutral
  const parts = neutral.split(" · ")
  return parts.length >= 3 ? [...parts.slice(0, -1), named].join(" · ") : `${neutral} · ${named}`
}

// Für die Darstellung im Lebenslauf: Kopfzeile je Station, darunter Stichpunkte.
export function parseWerdegang(text: string, anonym = true): WerdegangStation[] {
  const stations: WerdegangStation[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("- ")) {
      if (stations.length === 0) stations.push({ heading: "", tasks: [] })
      stations[stations.length - 1].tasks.push(line.slice(2).trim())
    } else stations.push({ heading: stationHeading(line, anonym), tasks: [] })
  }
  return stations
}

// Prüfsumme der Angaben, aus denen der Werdegang entsteht (FNV-1a) - ändern sie sich, ist
// der gespeicherte Werdegang veraltet.
export function werdegangInputHash(c: WerdegangInput): string {
  const cf = c.custom_fields ?? {}
  const source = JSON.stringify([c.berufsbild ?? "", c.notes?.trim() ?? "", FIELDS.map(([k]) => String(cf[k] ?? "").trim())])
  let h = 0x811c9dc5
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

export async function generateWerdegang(db: SupabaseClient<Database>, candidateId: string): Promise<string> {
  const [{ data: c, error }, berufsbilder] = await Promise.all([
    db.from("candidates").select("berufsbild, custom_fields, notes").eq("id", candidateId).single(),
    fetchBerufsbilder(db),
  ])
  if (error) throw new Error(error.message)
  const answer = await generateText({
    tier: "smart",
    system: "Du schreibst Lebensläufe für Bewerber in Steuerkanzleien. Du bleibst bei den Fakten und ergänzt nur branchenübliche Aufgaben.",
    prompt: buildWerdegangPrompt({ ...c, custom_fields: (c.custom_fields ?? {}) as Record<string, unknown> }, undefined, berufsbilder),
    maxTokens: 3000,
    timeoutMs: 120_000,
  })
  const text = cleanWerdegang(answer)
  if (!text) throw new Error("KI-Antwort war leer.")
  const input = { ...c, custom_fields: (c.custom_fields ?? {}) as Record<string, unknown> }
  const { error: saveError } = await db.from("candidates").update({ cv_werdegang: text, cv_werdegang_input: werdegangInputHash(input) }).eq("id", candidateId)
  if (saveError) throw new Error(saveError.message)
  return text
}
