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
  startdatum?: string | null
  aufgaben?: string | null
  anforderungen?: string | null
}

// Anzahl Punkte in einem zeilenweise gepflegten Feld (Aufzählungszeichen werden ignoriert).
export function countPoints(text: string | null | undefined): number {
  return (text ?? "")
    .split(/\n+/)
    .map((l) => l.replace(/^[-•*✅]\s*/, "").trim())
    .filter(Boolean).length
}

export function missingPositionItems(p: PositionLike): string[] {
  const filled = (v: string | null | undefined) => !!(v ?? "").trim()
  const missing: string[] = []
  if (!filled(p.berufsbild)) missing.push("Berufsbild")
  if (!filled(p.plz)) missing.push("Standort")
  if (!filled(p.arbeitszeit)) missing.push("Arbeitszeit")
  if (!filled(p.berufserfahrung)) missing.push("Berufserfahrung")
  if (!filled(p.startdatum)) missing.push("Start")
  const aufgaben = countPoints(p.aufgaben)
  if (aufgaben < MIN_AUFGABEN) missing.push(`Aufgaben (${aufgaben}/${MIN_AUFGABEN})`)
  const anforderungen = countPoints(p.anforderungen)
  if (anforderungen < MIN_ANFORDERUNGEN) missing.push(`Anforderungen (${anforderungen}/${MIN_ANFORDERUNGEN})`)
  return missing
}

// Hängt einen Textbaustein als neue Zeile an, sofern er noch nicht drinsteht.
export function appendPoint(text: string | null | undefined, point: string): string {
  const current = (text ?? "").trim()
  if (current.split(/\n+/).some((l) => l.replace(/^[-•*✅]\s*/, "").trim() === point)) return current
  return current ? `${current}\n${point}` : point
}

const COMMON_ANFORDERUNGEN = [
  "Sicherer Umgang mit DATEV oder vergleichbarer Software",
  "Selbstständige, sorgfältige und strukturierte Arbeitsweise",
  "Freude an der Arbeit im Team und am Kontakt mit Mandanten",
  "Gute Kenntnisse in MS Office, insbesondere Excel",
  "Sehr gute Deutschkenntnisse in Wort und Schrift",
]

export const POSITION_SNIPPETS: Record<string, { aufgaben: string[]; anforderungen: string[] }> = {
  steuerfachangestellte: {
    aufgaben: [
      "Laufende Finanzbuchhaltung für einen festen Mandantenstamm",
      "Lohn- und Gehaltsabrechnungen inkl. Meldungen an Sozialversicherungsträger",
      "Erstellung von Umsatzsteuer-Voranmeldungen",
      "Mitwirkung bei Jahresabschlüssen",
      "Erstellung betrieblicher und privater Steuererklärungen",
      "Prüfung von Steuerbescheiden",
      "Ansprechpartner/in für Mandanten in steuerlichen Alltagsfragen",
    ],
    anforderungen: [
      "Abgeschlossene Ausbildung als Steuerfachangestellte/r",
      "Erste Berufserfahrung in einer Steuerkanzlei",
      ...COMMON_ANFORDERUNGEN,
    ],
  },
  steuerfachwirt: {
    aufgaben: [
      "Eigenverantwortliche Betreuung eines festen Mandantenstamms",
      "Erstellung von Jahresabschlüssen für Einzelunternehmen und Personengesellschaften",
      "Erstellung betrieblicher und privater Steuererklärungen",
      "Prüfung von Steuerbescheiden und Einlegen von Einsprüchen",
      "Vorbereitung und Begleitung von Betriebsprüfungen",
      "Fachliche Unterstützung und Anleitung von Kolleginnen und Kollegen",
    ],
    anforderungen: [
      "Erfolgreiche Fortbildung zum/zur Steuerfachwirt/in",
      "Mehrjährige Berufserfahrung in einer Steuerkanzlei",
      ...COMMON_ANFORDERUNGEN,
    ],
  },
  bilanzbuchhalter: {
    aufgaben: [
      "Erstellung von Monats-, Quartals- und Jahresabschlüssen nach HGB",
      "Betreuung der laufenden Finanzbuchhaltung anspruchsvoller Mandate",
      "Kontenabstimmungen und Abschlussbuchungen",
      "Erstellung betrieblicher Steuererklärungen",
      "Mitwirkung bei Auswertungen und Reportings für Mandanten",
      "Begleitung von Betriebsprüfungen",
    ],
    anforderungen: [
      "Weiterbildung zum/zur Bilanzbuchhalter/in (IHK) oder vergleichbare Qualifikation",
      "Mehrjährige Erfahrung in der Abschlusserstellung",
      ...COMMON_ANFORDERUNGEN,
    ],
  },
  steuerberater: {
    aufgaben: [
      "Eigenverantwortliche Betreuung und Beratung eines anspruchsvollen Mandantenstamms",
      "Erstellung und Prüfung von Jahresabschlüssen und Steuererklärungen",
      "Steuerliche Gestaltungsberatung für Unternehmen und Privatpersonen",
      "Vertretung von Mandanten gegenüber Finanzbehörden und bei Betriebsprüfungen",
      "Fachliche Führung und Weiterentwicklung des Teams",
      "Mitwirkung an der Weiterentwicklung der Kanzlei",
    ],
    anforderungen: [
      "Erfolgreich abgelegtes Steuerberaterexamen",
      "Mehrjährige Berufserfahrung in der Steuerberatung",
      "Unternehmerisches Denken und Freude an der Mandantenberatung",
      ...COMMON_ANFORDERUNGEN.slice(0, 3),
    ],
  },
}

export function snippetsFor(berufsbild: string | null | undefined): { aufgaben: string[]; anforderungen: string[] } {
  return POSITION_SNIPPETS[berufsbild ?? ""] ?? { aufgaben: [], anforderungen: COMMON_ANFORDERUNGEN }
}
