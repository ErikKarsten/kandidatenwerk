// Benefits für Kanzleistelle24 per KI aufbereiten (Paket 28, T-113). Im Kanzleiprofil
// stehen Benefits, Arbeitszeiten und Homeoffice so, wie sie im Gespräch notiert wurden
// ("Firmenwagen wenn es passt", "Laut jüngstem Gespräch Vollzeit vor Ort", halbe Sätze
// durch Komma-Trennung). Für die Stellenanzeige formuliert die KI daraus kurze, saubere
// Stichpunkte. Das Ergebnis wird am Profil gespeichert und nur neu erzeugt, wenn sich die
// Angaben ändern (Hash) - automatische Synchronisierungen kosten so keine KI-Aufrufe.
// Ohne KI oder bei Fehlern gelten die Rohangaben (bisheriges Verhalten).
import { createHash } from "node:crypto"
import { generateText, llmConfigured } from "@/lib/llm"

const PROMPT_VERSION = "1"
const WORKING_MODELS = ["vor_ort", "hybrid", "remote"] as const
export type WorkingModel = (typeof WORKING_MODELS)[number]

export interface BenefitSource {
  benefits?: string[] | null
  arbeitszeiten?: string | null
  homeoffice?: string | null
}

export interface PreparedBenefits {
  benefits: string[]
  workingModel: WorkingModel | null
}

const SYSTEM = `Du bereitest Angaben einer Steuerkanzlei für eine Stellenanzeige auf der Jobbörse Kanzleistelle24 auf.
Die Angaben stammen aus Gesprächsnotizen des Recruiting-Teams: Sie enthalten Notizen wie "laut jüngstem Gespräch", Einschränkungen wie "wenn es passt", interne Details (z.B. Anzahl der Sekretärinnen) und durch Kommas zerschnittene Halbsätze.

Erstelle daraus die Liste "Das bieten wir" für Bewerber:
- Nur echte Vorteile für Bewerber. Weglassen: Gesprächsnotizen, interne Details, Selbstverständlichkeiten (z.B. "Vollzeit", "Tätigkeit vor Ort", "Notebook"), Gehalt und konkrete Beträge.
- Zusammengehörige Halbsätze wieder zusammenführen.
- Unsichere Vorteile nur mit "nach Absprache" aufnehmen (z.B. "Firmenwagen nach Absprache"), nie mit Bedingungen wie "wenn es passt".
- Ähnliche Punkte bündeln (z.B. Ausstattung: "Moderner Arbeitsplatz mit zwei Monitoren und höhenverstellbarem Schreibtisch").
- Homeoffice nur als Vorteil aufnehmen, wenn es tatsächlich angeboten wird.
- Höchstens 10 Punkte, je höchstens 70 Zeichen, sachlich, ohne Ausrufezeichen und Emojis, Substantivstil.
- Nichts erfinden.

Bestimme außerdem das Arbeitsmodell: "vor_ort", "hybrid" (Homeoffice teilweise möglich) oder "remote" (überwiegend mobil).

Antworte nur mit JSON: {"benefits": ["..."], "working_model": "vor_ort"}`

export function benefitSourceHash(source: BenefitSource): string {
  const normalized = JSON.stringify([PROMPT_VERSION, (source.benefits ?? []).map((b) => b.trim()), (source.arbeitszeiten ?? "").trim(), (source.homeoffice ?? "").trim()])
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32)
}

export function hasBenefitSource(source: BenefitSource): boolean {
  return (source.benefits ?? []).some((b) => b.trim()) || !!source.arbeitszeiten?.trim() || !!source.homeoffice?.trim()
}

// Liest die JSON-Antwort des Modells; null, wenn sie unbrauchbar ist.
export function parseBenefitAnswer(text: string): PreparedBenefits | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const json = JSON.parse(match[0]) as { benefits?: unknown; working_model?: unknown }
    if (!Array.isArray(json.benefits)) return null
    const benefits = json.benefits
      .filter((b): b is string => typeof b === "string")
      .map((b) => b.replace(/^[-•*✅]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 10)
    if (benefits.length === 0) return null
    const wm = WORKING_MODELS.find((m) => m === json.working_model) ?? null
    return { benefits, workingModel: wm }
  } catch {
    return null
  }
}

export async function prepareBenefits(source: BenefitSource): Promise<PreparedBenefits | null> {
  if (!llmConfigured() || !hasBenefitSource(source)) return null
  const prompt = [
    "Benefits laut Kanzleiprofil:",
    ...(source.benefits ?? []).filter((b) => b.trim()).map((b) => `- ${b.trim()}`),
    "",
    `Arbeitszeiten: ${source.arbeitszeiten?.trim() || "(keine Angabe)"}`,
    `Homeoffice: ${source.homeoffice?.trim() || "(keine Angabe)"}`,
  ].join("\n")
  const text = await generateText({ tier: "smart", system: SYSTEM, prompt, maxTokens: 1200, timeoutMs: 60_000 })
  return parseBenefitAnswer(text)
}
