// Lebenslauf-Export (Paket 24, T-97): baut aus Stammdaten und Zusatzfeldern eines
// Kandidaten einen gegliederten Lebenslauf für Kanzleien - wie man ihn kennt (Profil,
// Fachliches, aktuelle Situation, Wechselmotivation, Rahmen), ohne Beschreibung/Notizen.
// Anonymisiert: ohne Name, Kontaktdaten, Erreichbarkeit und genaue PLZ.
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"

export interface CvCandidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  plz: string | null
  berufsbild: string | null
  custom_fields: Record<string, unknown> | null
}

export interface CvItem {
  label: string
  value: string
}

export interface CvSection {
  title: string
  items: CvItem[]
}

export interface Cv {
  title: string
  subtitle: string
  facts: CvItem[]
  sections: CvSection[]
}

// Lebenslauf-Bezeichnungen statt der Formularfragen.
const LABELS: Record<string, string> = {
  ausbildung: "Ausbildung / Qualifikation",
  bevorzugter_bereich: "Bevorzugte Tätigkeitsbereiche",
  betreute_branchen: "Betreute Branchen",
  datev_erfahrung: "DATEV",
  aktuelle_steuerkanzlei: "Derzeit in einer Steuerkanzlei tätig",
  kanzleigroesse: "Größe der aktuellen Kanzlei",
  anzahl_ag_5_jahre: "Arbeitgeber in den letzten 5 Jahren",
  wechselgrund: "Wechselgrund",
  erwartungen_neuer_ag: "Erwartungen an den neuen Arbeitgeber",
  verfuegbar_ab: "Kündigungsfrist",
  gehaltsvorstellung: "Gehaltsvorstellung",
  alter: "Alter",
  erreichbarkeit: "Erreichbarkeit",
}

const SECTIONS: { title: string; keys: string[] }[] = [
  { title: "Qualifikation", keys: ["ausbildung"] },
  { title: "Fachliche Schwerpunkte", keys: ["bevorzugter_bereich", "betreute_branchen", "datev_erfahrung"] },
  { title: "Aktuelle Situation", keys: ["aktuelle_steuerkanzlei", "kanzleigroesse", "anzahl_ag_5_jahre"] },
  { title: "Wechselmotivation", keys: ["wechselgrund", "erwartungen_neuer_ag"] },
  { title: "Rahmen", keys: ["verfuegbar_ab", "gehaltsvorstellung"] },
]

// Nie im Lebenslauf: Sammelfeld der Formularantworten und interne Hilfsfelder.
const EXCLUDED = new Set(["weitere_antworten", "wohnort_plz"])
const PERSONAL = new Set(["erreichbarkeit"])

function text(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
}

// Kurzkennung für anonymisierte Lebensläufe (stabil je Kandidat).
export function cvReference(id: string): string {
  return `K-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`
}

export function buildCv(c: CvCandidate, definitions: { key: string; label: string; active: boolean }[], anonym: boolean): Cv {
  const fields = c.custom_fields ?? {}
  const value = (key: string) => text(fields[key])
  const berufsbild = BERUFSBILD_OPTIONS.find((o) => o.value === c.berufsbild)?.label ?? null
  const used = new Set<string>()

  const plz = c.plz?.trim() || value("wohnort_plz")
  const wohnort = plz ? (anonym ? `PLZ-Gebiet ${plz.slice(0, 2)}xxx` : plz) : ""
  const facts: CvItem[] = [
    { label: "Berufsbild", value: berufsbild ?? "" },
    { label: "Wohnort", value: wohnort },
    { label: "Alter", value: value("alter") ? `${value("alter").replace(/\s*jahre?$/i, "")} Jahre` : "" },
    { label: "Kündigungsfrist", value: value("verfuegbar_ab") },
  ].filter((f) => f.value)
  used.add("alter")

  const sections: CvSection[] = []
  for (const s of SECTIONS) {
    const items = s.keys
      .filter((k) => !(anonym && PERSONAL.has(k)))
      .map((k) => {
        used.add(k)
        return { label: LABELS[k] ?? k, value: value(k) }
      })
      .filter((i) => i.value)
    if (items.length) sections.push({ title: s.title, items })
  }

  // Weitere aktive Zusatzfelder mit Wert (eigene Felder der Agentur).
  const extra = definitions
    .filter((d) => d.active && !used.has(d.key) && !EXCLUDED.has(d.key) && !(anonym && PERSONAL.has(d.key)))
    .map((d) => ({ label: LABELS[d.key] ?? d.label, value: value(d.key) }))
    .filter((i) => i.value)
  if (extra.length) sections.push({ title: "Weitere Angaben", items: extra })

  if (!anonym) {
    const contact = [
      { label: "E-Mail", value: c.email ?? "" },
      { label: "Telefon", value: c.phone ?? "" },
      { label: LABELS.erreichbarkeit, value: value("erreichbarkeit") },
    ].filter((i) => i.value)
    if (contact.length) sections.push({ title: "Kontakt", items: contact })
  }

  return {
    title: anonym ? `Kandidat:in ${cvReference(c.id)}` : `${c.first_name} ${c.last_name}`.trim(),
    subtitle: berufsbild ?? "Kandidatenprofil",
    facts,
    sections,
  }
}
