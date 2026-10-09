// Berufsbilder (Paket 45): gepflegt in der Tabelle "berufsbilder" (Einstellungen > Felder).
// Die Liste hier ist nur der Ausgangsstand der Tabelle und Rückfall, wenn sie nicht geladen
// ist (Skripte, Tests). In der App kommen die Werte aus loadBerufsbilder() (Server) bzw.
// useBerufsbilder() (Browser).
export interface BerufsbildOption {
  value: string
  label: string
  active?: boolean
}

export const BERUFSBILD_OPTIONS: BerufsbildOption[] = [
  { value: "steuerfachangestellte", label: "Steuerfachangestellte" },
  { value: "steuerfachwirt", label: "Steuerfachwirt" },
  { value: "bilanzbuchhalter", label: "Bilanzbuchhalter" },
  { value: "finanzbuchhalter", label: "Finanzbuchhalter" },
  { value: "lohnbuchhalter", label: "Lohnbuchhalter" },
  { value: "steuerberater", label: "Steuerberater" },
  { value: "sonstige", label: "Sonstige" },
]

export type Berufsbild = string

export function berufsbildLabel(value: string | null | undefined, options: BerufsbildOption[] = BERUFSBILD_OPTIONS): string | null {
  if (!value) return null
  return options.find((o) => o.value === value)?.label ?? value
}

// Auswahl für Formulare: aktive Berufsbilder, dazu der aktuelle Wert, falls er inzwischen
// deaktiviert ist (sonst verschwände er aus dem Feld).
export function berufsbildChoices(options: BerufsbildOption[], current?: string | null): BerufsbildOption[] {
  return options.filter((o) => o.active !== false || o.value === current)
}

// Schlüssel aus einer Bezeichnung: "Lohn- & Gehaltsbuchhalter" -> "lohn_gehaltsbuchhalter".
export function berufsbildKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
}
