// Schwerpunkte für Musterdatensätze (Paket 57) - client-tauglich, Mehrfachauswahl.
export const SAMPLE_FOCUS_OPTIONS = ["Lohnbuchhaltung", "Jahresabschlüsse", "Finanzbuchhaltung", "Steuererklärungen"] as const

export function cleanFocus(values: unknown): string[] {
  return Array.isArray(values) ? SAMPLE_FOCUS_OPTIONS.filter((o) => values.includes(o)) : []
}

// Kanzleisoftware der Musterdatensätze (Paket 62). Bei DATEV gehört immer auch
// "DATEV Unternehmen online" dazu.
export const SAMPLE_SOFTWARE_OPTIONS = ["DATEV", "ADDISON", "Agenda"] as const
export type SampleSoftware = (typeof SAMPLE_SOFTWARE_OPTIONS)[number]

export function cleanSoftware(value: unknown): SampleSoftware {
  return SAMPLE_SOFTWARE_OPTIONS.find((o) => o === value) ?? "DATEV"
}

// Freifeld "Zusatzinfos" (Paket 62): fließt in den KI-Auftrag ein.
export const SAMPLE_EXTRA_MAX = 600

export function cleanExtra(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, SAMPLE_EXTRA_MAX) : ""
}
