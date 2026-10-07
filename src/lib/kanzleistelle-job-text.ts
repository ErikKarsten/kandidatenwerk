// Stellenanzeige für Kanzleistelle24 per KI texten (Paket 30, T-125). Aufgaben und
// Anforderungen im Stellenprofil stammen oft aus Gesprächsnotizen bzw. aus Close/Zapier
// und enthalten interne Wünsche der Kanzlei ("keine Berufsanfänger", "sofort einsatzfähig
// ohne Einarbeitung"). Für Bewerber formuliert die KI daraus Stichpunkte im Stil der
// Textbausteine. Ergebnis wird je Stelle gespeichert und nur bei geänderten Angaben neu
// erzeugt (Hash). Ohne KI oder bei Fehlern gelten die Rohangaben (bisheriges Verhalten).
import { createHash } from "node:crypto"
import { generateText, llmConfigured } from "@/lib/llm"

const PROMPT_VERSION = "1"

export interface JobTextSource {
  title?: string | null
  berufsbild?: string | null
  aufgaben?: string | null
  anforderungen?: string | null
  berufserfahrung?: string | null
  software?: string | null
}

export interface PreparedJobText {
  aufgaben: string[]
  anforderungen: string[]
}

const SYSTEM = `Du schreibst die Abschnitte "Ihre Aufgaben" und "Ihr Profil" einer Stellenanzeige für eine Steuerkanzlei auf der Jobbörse Kanzleistelle24. Leser sind Fachkräfte (Steuerfachangestellte, Steuerfachwirte, Bilanzbuchhalter, Steuerberater).

Die Angaben stammen aus internen Gesprächsnotizen mit der Kanzlei. Sie enthalten oft Wünsche und Ausschlüsse, die Bewerber so nicht lesen sollen, z.B. "keine Berufsanfänger", "keine frischen Steuergehilfen", "sofort einsatzfähig ohne umfangreiche Einarbeitung", "kein Big-Four-Hintergrund", "realistische Gehaltsvorstellung".

Regeln:
- Formuliere wie eine professionelle, wertschätzende Stellenanzeige im Stil der Beispiel-Textbausteine: kurze Stichpunkte im Substantiv- oder Infinitivstil, ohne Ausrufezeichen und Emojis.
- Ausschlüsse und interne Wünsche nie übernehmen, sondern positiv als Anforderung formulieren, wenn sie fachlich relevant sind (z.B. "keine Berufsanfänger" -> "Mehrjährige Berufserfahrung in einer Steuerkanzlei"; "sofort einsatzfähig" -> "Selbstständige Arbeitsweise"). Sonst weglassen.
- Nichts über Gehalt, Kandidatenauswahl oder Gründe der Kanzlei.
- Berufserfahrung und Software (z.B. DATEV) in die Anforderungen einarbeiten, wenn angegeben.
- Nur Inhalte, die sich aus den Angaben ergeben - nichts erfinden.
- Aufgaben: 3 bis 8 Punkte. Anforderungen: 3 bis 7 Punkte. Je höchstens 100 Zeichen.

Antworte nur mit JSON: {"aufgaben": ["..."], "anforderungen": ["..."]}`

export function jobTextHash(source: JobTextSource): string {
  const t = (v: string | null | undefined) => (v ?? "").trim()
  const normalized = JSON.stringify([PROMPT_VERSION, t(source.title), t(source.berufsbild), t(source.aufgaben), t(source.anforderungen), t(source.berufserfahrung), t(source.software)])
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32)
}

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/^[-•*✅]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, max)
}

export function parseJobTextAnswer(text: string): PreparedJobText | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const json = JSON.parse(match[0]) as { aufgaben?: unknown; anforderungen?: unknown }
    const aufgaben = cleanList(json.aufgaben, 8)
    const anforderungen = cleanList(json.anforderungen, 7)
    return aufgaben.length > 0 || anforderungen.length > 0 ? { aufgaben, anforderungen } : null
  } catch {
    return null
  }
}

export async function prepareJobText(source: JobTextSource, exampleSnippets: string[]): Promise<PreparedJobText | null> {
  if (!llmConfigured() || (!source.aufgaben?.trim() && !source.anforderungen?.trim())) return null
  const prompt = [
    `Stelle: ${source.title?.trim() || "(ohne Titel)"}`,
    source.berufsbild ? `Berufsbild: ${source.berufsbild}` : null,
    "",
    "Aufgaben laut Stellenprofil:",
    source.aufgaben?.trim() || "(keine Angabe)",
    "",
    "Anforderungen laut Stellenprofil:",
    source.anforderungen?.trim() || "(keine Angabe)",
    "",
    `Berufserfahrung: ${source.berufserfahrung?.trim() || "(keine Angabe)"}`,
    `Software: ${source.software?.trim() || "(keine Angabe)"}`,
    exampleSnippets.length ? `\nBeispiel-Textbausteine (Stil):\n${exampleSnippets.map((s) => `- ${s}`).join("\n")}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n")
  const text = await generateText({ tier: "smart", system: SYSTEM, prompt, maxTokens: 1500, timeoutMs: 60_000 })
  return parseJobTextAnswer(text)
}
