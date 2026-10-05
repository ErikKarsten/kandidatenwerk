// Projekt-Reiter beim Kunden (Paket 9, ClickUp-Ersatz): Phasen, Kommentar-Arten und
// die Felder des Kanzleiprofils. Ohne Server-Code, auch im Browser nutzbar.

export const PROJECT_PHASES = [
  { value: "onboarding", label: "Onboarding", color: "#b45309" },
  { value: "kampagne_vorbereitung", label: "Kampagne in Vorbereitung", color: "#1e56a0" },
  { value: "live", label: "Live", color: "#1a9a6a" },
  { value: "pausiert", label: "Pausiert", color: "#6b7280" },
  { value: "gekuendigt", label: "Gekündigt", color: "#dc2626" },
] as const

// Automatische Aufgabe, sobald ein Projekt in "Kampagne in Vorbereitung" wechselt
// (Paket 13). Zuständig ist Elea Günther; gibt es den Zugang nicht, bekommt sie, wer
// die Phase gesetzt hat.
export const CAMPAIGN_CHECK_TASK = {
  phase: "kampagne_vorbereitung",
  title: "Kampagnenstatus prüfen",
  assigneeEmail: "e.guenther@endlich-mitarbeiter.de",
} as const

export const COMMENT_KINDS = [
  { value: "notiz", label: "Notiz" },
  { value: "termin", label: "Termin" },
  { value: "telefonat", label: "Telefonat" },
  { value: "email", label: "E-Mail" },
] as const

export type ProfileFieldKey =
  | "kurzbeschreibung"
  | "intro"
  | "website"
  | "mitarbeiterzahl"
  | "standorte"
  | "mandantenstruktur"
  | "software"
  | "arbeitszeiten"
  | "homeoffice"
  | "ansprechpartner_bewerbung"
  | "painpoints"
  | "ziele_zusammenarbeit"
  | "vertriebsnotizen"

// required: muss gefüllt sein, bevor der Key Account Manager das Profil abschließen
// kann (diese Angaben braucht auch die Stellenanzeige auf Kanzleistelle24).
// internal: nur für das Team (Vertriebswissen), geht nicht in die Kanzleistelle24-Anzeige.
export const PROFILE_FIELDS: { key: ProfileFieldKey; label: string; multiline?: boolean; required?: boolean; internal?: boolean; placeholder?: string }[] = [
  { key: "kurzbeschreibung", label: "Kurzbeschreibung", required: true, placeholder: "Ein Satz, z.B. Moderne Steuerkanzlei mit 15 Mitarbeitenden in Köln" },
  { key: "intro", label: "Intro zur Kanzlei", multiline: true, required: true, placeholder: "Wer ist die Kanzlei, was macht sie aus?" },
  { key: "website", label: "Website" },
  { key: "mitarbeiterzahl", label: "Mitarbeiterzahl", required: true },
  { key: "standorte", label: "Standort(e)", required: true },
  { key: "mandantenstruktur", label: "Mandantenstruktur / Branchen", multiline: true },
  { key: "software", label: "Software", placeholder: "z.B. DATEV, Addison" },
  { key: "arbeitszeiten", label: "Arbeitszeiten", placeholder: "z.B. Gleitzeit, 4-Tage-Woche möglich" },
  { key: "homeoffice", label: "Homeoffice" },
  { key: "ansprechpartner_bewerbung", label: "Ansprechpartner für Bewerbungsgespräche" },
  { key: "painpoints", label: "Painpoints – warum arbeitet die Kanzlei mit uns?", multiline: true, internal: true },
  { key: "ziele_zusammenarbeit", label: "Ziele / Erwartungen an die Zusammenarbeit", multiline: true, internal: true },
  { key: "vertriebsnotizen", label: "Notizen aus dem Vertrieb", multiline: true, internal: true },
]

export interface ClientProfileValues extends Partial<Record<ProfileFieldKey, string | null>> {
  benefits?: string[] | null
}

// Fehlende Pflichtangaben für "Profil abschließen" (Benefits und mind. eine Stelle
// gehören ebenfalls dazu).
export function missingProfileItems(profile: ClientProfileValues | null, positionCount: number): string[] {
  const missing = PROFILE_FIELDS.filter((f) => f.required && !(profile?.[f.key] ?? "").trim()).map((f) => f.label)
  if (!(profile?.benefits ?? []).some((b) => b.trim())) missing.push("Benefits")
  if (positionCount === 0) missing.push("Mindestens eine gesuchte Stelle")
  return missing
}

export function contractEnd(start: string | null, termMonths: number | null): string | null {
  if (!start || !termMonths) return null
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + termMonths)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
