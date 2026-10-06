// Vollständiges Stellenprofil (Paket 17, T-79): Pflichtangaben je gesuchter Stelle und
// Textbausteine je Berufsbild. Aufgaben und Anforderungen werden zeilenweise gepflegt
// (eine Zeile = ein Punkt) - so entstehen auf Kanzleistelle24 Aufzählungen bzw.
// Anforderungs-Chips. Das Kanzleiprofil lässt sich erst abschließen, wenn jede Stelle
// vollständig ist.

export const MIN_AUFGABEN = 4
export const MIN_ANFORDERUNGEN = 3

export interface PositionLike {
  title?: string | null
  berufsbild?: string | null
  plz?: string | null
  arbeitszeit?: string | null
  berufserfahrung?: string | null
  software?: string | null
  gehalt?: string | null
  startdatum?: string | null
  aufgaben?: string | null
  anforderungen?: string | null
  extra?: unknown
}

// Felder des Stellenprofils, wie sie für die Pflichtprüfung gebraucht werden (eingestellt
// in Einstellungen > Felder, siehe profile-fields.ts).
export interface PositionFieldRule {
  key: string
  label: string
  required: boolean
  custom: boolean
}

// Eingebaute Felder des Stellenprofils. Bezeichnung, Berufsbild und Standort sind immer
// Pflicht und nicht einstellbar (Matching, Kampagnen, Kanzleistelle24 brauchen sie).
export const STELLE_BUILTIN_FIELDS: { key: string; label: string; hint?: string; required?: boolean; multiline?: boolean }[] = [
  { key: "arbeitszeit", label: "Arbeitszeit", hint: "Vollzeit / Teilzeit, Stunden", required: true },
  { key: "berufserfahrung", label: "Berufserfahrung", hint: "z.B. ab 2 Jahre", required: true },
  { key: "software", label: "Software / Buchhaltungsprogramm", hint: "z.B. DATEV" },
  { key: "gehalt", label: "Gehalt (intern, nicht auf Kanzleistelle24)", hint: "z.B. 45.000–55.000 €" },
  { key: "startdatum", label: "Start", hint: "z.B. ab sofort", required: true },
  { key: "aufgaben", label: "Aufgaben", required: true, multiline: true },
  { key: "anforderungen", label: "Anforderungen", required: true, multiline: true },
]

const DEFAULT_RULES: PositionFieldRule[] = STELLE_BUILTIN_FIELDS.map((f) => ({ key: f.key, label: f.label, required: !!f.required, custom: false }))

// Anzahl Punkte in einem zeilenweise gepflegten Feld (Aufzählungszeichen werden ignoriert).
export function countPoints(text: string | null | undefined): number {
  return (text ?? "")
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*✅]\s*/, "").trim())
    .filter(Boolean).length
}

export function missingPositionItems(p: PositionLike, rules: PositionFieldRule[] = DEFAULT_RULES): string[] {
  const filled = (v: unknown) => typeof v === "string" && !!v.trim()
  const extra = (p.extra && typeof p.extra === "object" ? p.extra : {}) as Record<string, unknown>
  const missing: string[] = []
  if (!filled(p.berufsbild)) missing.push("Berufsbild")
  if (!filled(p.plz)) missing.push("Standort")
  for (const r of rules.filter((x) => x.required)) {
    const value = r.custom ? extra[r.key] : (p as Record<string, unknown>)[r.key]
    if (r.key === "aufgaben" || r.key === "anforderungen") {
      const min = r.key === "aufgaben" ? MIN_AUFGABEN : MIN_ANFORDERUNGEN
      const count = countPoints(typeof value === "string" ? value : null)
      if (count < min) missing.push(`${r.label} (${count}/${min})`)
    } else if (!filled(value)) {
      missing.push(r.label)
    }
  }
  return missing
}

// Hängt einen Textbaustein als neue Zeile an, sofern er noch nicht drinsteht.
export function appendPoint(text: string | null | undefined, point: string): string {
  const current = (text ?? "").trim()
  if (current.split(/\n+/).some((l) => l.replace(/^[-•*✅]\s*/, "").trim() === point)) return current
  return current ? `${current}\n${point}` : point
}
