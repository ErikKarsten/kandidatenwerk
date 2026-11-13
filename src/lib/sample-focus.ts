// Auswahl für Musterdatensätze - client-tauglich.
//
// Fachrichtung (Paket 103): Rechtsanwaltsfachangestellte arbeiten in Rechtsanwaltskanzleien,
// alle anderen Berufsbilder in Steuerkanzleien. Danach richten sich Software, Schwerpunkte
// und der KI-Auftrag (src/lib/sample-candidates.ts).
export type SampleField = "steuer" | "recht"

export function sampleField(berufsbild: string): SampleField {
  return /rechtsanwalt|rechtsfachwirt|notarfach|refa/i.test(berufsbild) ? "recht" : "steuer"
}

// Schwerpunkte (Paket 57), Mehrfachauswahl.
export const SAMPLE_FOCUS_BY_FIELD = {
  steuer: ["Lohnbuchhaltung", "Jahresabschlüsse", "Finanzbuchhaltung", "Steuererklärungen"],
  recht: ["Fristen und Termine", "Zwangsvollstreckung und Mahnwesen", "Kostenrecht und RVG-Abrechnung", "Mandantenbetreuung und Korrespondenz"],
} as const satisfies Record<SampleField, readonly string[]>

export const SAMPLE_FOCUS_OPTIONS = SAMPLE_FOCUS_BY_FIELD.steuer

export function focusOptions(berufsbild: string): readonly string[] {
  return SAMPLE_FOCUS_BY_FIELD[sampleField(berufsbild)]
}

export function cleanFocus(values: unknown, berufsbild = ""): string[] {
  return Array.isArray(values) ? focusOptions(berufsbild).filter((o) => values.includes(o)) : []
}

// Kanzleisoftware der Musterdatensätze (Paket 62), die erste ist jeweils voreingestellt.
// Bei DATEV gehört immer auch "DATEV Unternehmen online" dazu.
export const SAMPLE_SOFTWARE_BY_FIELD = {
  steuer: ["DATEV", "ADDISON", "Agenda"],
  recht: ["RA-MICRO", "Advoware", "DATEV Anwalt"],
} as const satisfies Record<SampleField, readonly string[]>

export const SAMPLE_SOFTWARE_OPTIONS = [...SAMPLE_SOFTWARE_BY_FIELD.steuer, ...SAMPLE_SOFTWARE_BY_FIELD.recht] as const
export type SampleSoftware = (typeof SAMPLE_SOFTWARE_OPTIONS)[number]

export function softwareOptions(berufsbild: string): readonly SampleSoftware[] {
  return SAMPLE_SOFTWARE_BY_FIELD[sampleField(berufsbild)]
}

// Ungültige oder zur Fachrichtung unpassende Software -> Voreinstellung der Fachrichtung.
export function cleanSoftware(value: unknown, berufsbild = ""): SampleSoftware {
  const options = softwareOptions(berufsbild)
  return options.find((o) => o === value) ?? options[0]
}

// Freifeld "Zusatzinfos" (Paket 62): fließt in den KI-Auftrag ein.
export const SAMPLE_EXTRA_MAX = 600

export function cleanExtra(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, SAMPLE_EXTRA_MAX) : ""
}
