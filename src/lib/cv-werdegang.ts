// Werdegang für den Lebenslauf per KI (Paket 43): formuliert aus den Angaben eines
// Kandidaten die Stationen der letzten zehn Jahre und reichert sie um die typischen
// Aufgaben des Berufsbilds an, damit der Lebenslauf (vollständig wie anonymisiert)
// aussagekräftig ist. Erfunden wird nichts Überprüfbares: keine Arbeitgebernamen, keine
// Abschlüsse, keine genauen Daten, die nicht in den Angaben stehen.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { BERUFSBILD_OPTIONS, berufsbildLabel, type BerufsbildOption } from "@/lib/berufsbild"
import { fetchBerufsbilder } from "@/lib/berufsbild-db"
import { generateText } from "@/lib/llm"

export interface WerdegangInput {
  berufsbild: string | null
  custom_fields: Record<string, unknown> | null
  notes: string | null
  cv_werdegang: string | null
}

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
    c.cv_werdegang?.trim() ? `\nVom Team erfasster Werdegang (wichtigste Quelle, alle Stationen übernehmen):\n${mask(c.cv_werdegang.trim())}` : "",
    c.notes?.trim() ? `\nNotizen des Recruiters (Gesprächsnotizen, nur Fakten zum Werdegang verwenden):\n${mask(c.notes.trim()).slice(0, 3000)}` : "",
    "",
    "Regeln:",
    "- Übernimm alle Stationen, Zeiträume, Positionen und Abschlüsse aus den Angaben. Erfinde keine weiteren Stationen, Abschlüsse oder Zertifikate.",
    "- Keine Arbeitgeber- oder Personennamen, keine Orte unterhalb der Region, keine Kontaktdaten - beschreibe Arbeitgeber neutral (z. B. \"Steuerkanzlei, ca. 15 Mitarbeitende\").",
    "- Jahreszahlen nur, wenn sie in den Angaben stehen oder sich eindeutig ergeben; sonst ohne Zeitraum oder mit \"aktuell\".",
    `- Ergänze je Station 3 bis 6 Aufgaben, die in dieser Position typischerweise anfallen - passend zum Berufsbild ${berufsbild} und zu genannten Schwerpunkten, Branchen und Software. Genannte Tätigkeiten haben Vorrang.`,
    "- Gibt es keine erkennbaren Stationen: eine Station für die aktuelle bzw. letzte Tätigkeit laut Ausbildung und Berufsbild.",
    "- Fachfremde Bewerber (z. B. Bürokaufleute) nicht zu Steuerfachkräften machen - ihren tatsächlichen Hintergrund beschreiben.",
    "- Neueste Station zuerst. Sachlich, in der dritten Person ohne Pronomen, Stichpunkte.",
    "",
    "Format (nur Text, kein Markdown, keine Einleitung):",
    "Zeitraum · Position · Arbeitgeber neutral",
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

// Für die Darstellung im Lebenslauf: Kopfzeile je Station, darunter Stichpunkte.
export function parseWerdegang(text: string): WerdegangStation[] {
  const stations: WerdegangStation[] = []
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("- ")) {
      if (stations.length === 0) stations.push({ heading: "", tasks: [] })
      stations[stations.length - 1].tasks.push(line.slice(2).trim())
    } else stations.push({ heading: line, tasks: [] })
  }
  return stations
}

export async function generateWerdegang(db: SupabaseClient<Database>, candidateId: string): Promise<string> {
  const [{ data: c, error }, berufsbilder] = await Promise.all([
    db.from("candidates").select("berufsbild, custom_fields, notes, cv_werdegang").eq("id", candidateId).single(),
    fetchBerufsbilder(db),
  ])
  if (error) throw new Error(error.message)
  const answer = await generateText({
    tier: "smart",
    system: "Du schreibst Lebensläufe für Bewerber in Steuerkanzleien. Du bleibst bei den Fakten und ergänzt nur branchenübliche Aufgaben.",
    prompt: buildWerdegangPrompt({ ...c, custom_fields: (c.custom_fields ?? {}) as Record<string, unknown> }, undefined, berufsbilder),
    maxTokens: 2000,
    timeoutMs: 120_000,
  })
  const text = cleanWerdegang(answer)
  if (!text) throw new Error("KI-Antwort war leer.")
  const { error: saveError } = await db.from("candidates").update({ cv_werdegang: text }).eq("id", candidateId)
  if (saveError) throw new Error(saveError.message)
  return text
}
