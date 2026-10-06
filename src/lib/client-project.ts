// Projekt-Reiter beim Kunden (Paket 9, ClickUp-Ersatz): Phasen, Kommentar-Arten und
// die Felder des Kanzleiprofils. Ohne Server-Code, auch im Browser nutzbar.
import { missingPositionItems, type PositionLike } from "@/lib/position-profile"

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
  // Automatisch aus Close-Besprechungen (Paket 17, T-54).
  { value: "gespraech", label: "Gespräch" },
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
  | "gehaltsgefuege"
  | "ansprechpartner_bewerbung"
  | "painpoints"
  | "ziele_zusammenarbeit"
  | "vertriebsnotizen"

// Abschnitte des Kanzleiprofils (Paket 13). "angebot" = was die Kanzlei Bewerbern bietet,
// "intern" = Vertriebswissen, geht nicht in die Kanzleistelle24-Anzeige.
export const PROFILE_GROUPS = [
  { value: "kanzlei", label: "Kanzlei" },
  { value: "angebot", label: "Arbeitgeberangebot" },
  { value: "intern", label: "Vertrieb (intern)" },
] as const
export type ProfileGroup = (typeof PROFILE_GROUPS)[number]["value"]

// required: muss gefüllt sein, bevor der Key Account Manager das Profil abschließen
// kann (diese Angaben braucht auch die Stellenanzeige auf Kanzleistelle24).
export const PROFILE_FIELDS: {
  key: ProfileFieldKey
  label: string
  group: ProfileGroup
  multiline?: boolean
  required?: boolean
  placeholder?: string
}[] = [
  { key: "kurzbeschreibung", label: "Kurzbeschreibung", group: "kanzlei", required: true, placeholder: "Ein Satz, z.B. Moderne Steuerkanzlei mit 15 Mitarbeitenden in Köln" },
  { key: "intro", label: "Intro zur Kanzlei", group: "kanzlei", multiline: true, required: true, placeholder: "Wer ist die Kanzlei, was macht sie aus?" },
  { key: "website", label: "Website", group: "kanzlei" },
  { key: "mitarbeiterzahl", label: "Mitarbeiterzahl", group: "kanzlei", required: true },
  { key: "mandantenstruktur", label: "Mandantenstruktur / Branchen", group: "kanzlei", multiline: true },
  { key: "software", label: "Software", group: "kanzlei", placeholder: "z.B. DATEV, Addison" },
  { key: "ansprechpartner_bewerbung", label: "Ansprechpartner für Bewerbungsgespräche", group: "kanzlei" },
  {
    key: "gehaltsgefuege",
    label: "Gehaltsgefüge",
    group: "angebot",
    multiline: true,
    placeholder: "z.B. Steuerfachangestellte 42.000–52.000 € je nach Erfahrung, 13. Gehalt, jährliche Gehaltsrunde",
  },
  { key: "arbeitszeiten", label: "Arbeitszeiten", group: "angebot", placeholder: "z.B. Gleitzeit, 4-Tage-Woche möglich" },
  { key: "homeoffice", label: "Homeoffice", group: "angebot" },
  { key: "painpoints", label: "Painpoints – warum arbeitet die Kanzlei mit uns?", group: "intern", multiline: true },
  { key: "ziele_zusammenarbeit", label: "Ziele / Erwartungen an die Zusammenarbeit", group: "intern", multiline: true },
  { key: "vertriebsnotizen", label: "Notizen aus dem Vertrieb", group: "intern", multiline: true },
]

export interface ClientProfileValues extends Partial<Record<ProfileFieldKey, string | null>> {
  benefits?: string[] | null
}

// Fehlende Pflichtangaben für "Profil abschließen" (Benefits, mind. ein Standort und mind.
// eine Stelle gehören ebenfalls dazu). Standorte sind seit Paket 16 eine eigene Liste
// (client_locations) statt eines Textfelds; profile.standorte hält nur noch die
// Rohangabe aus Close.
export function missingProfileItems(profile: ClientProfileValues | null, positions: PositionLike[], locationCount: number): string[] {
  const missing = PROFILE_FIELDS.filter((f) => f.required && !(profile?.[f.key] ?? "").trim()).map((f) => f.label)
  if (locationCount === 0) missing.push("Standort(e)")
  if (!(profile?.benefits ?? []).some((b) => b.trim())) missing.push("Benefits")
  if (positions.length === 0) missing.push("Mindestens eine gesuchte Stelle")
  // Jede Stelle braucht ein vollständiges Stellenprofil (Paket 17, T-79).
  for (const p of positions) {
    if (missingPositionItems(p).length > 0) missing.push(`Stelle „${(p.title ?? "").trim() || "ohne Titel"}“ unvollständig`)
  }
  return missing
}

export function contractEnd(start: string | null, termMonths: number | null): string | null {
  if (!start || !termMonths) return null
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + termMonths)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
