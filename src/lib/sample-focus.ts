// Schwerpunkte für Musterdatensätze (Paket 57) - client-tauglich, Mehrfachauswahl.
export const SAMPLE_FOCUS_OPTIONS = ["Lohnbuchhaltung", "Jahresabschlüsse", "Finanzbuchhaltung", "Steuererklärungen"] as const

export function cleanFocus(values: unknown): string[] {
  return Array.isArray(values) ? SAMPLE_FOCUS_OPTIONS.filter((o) => values.includes(o)) : []
}
