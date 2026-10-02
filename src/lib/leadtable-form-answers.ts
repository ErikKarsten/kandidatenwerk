// Ordnet die Formularantworten eines Leadtable-Leads (funnelData.profile, Fragen-Titel ->
// Antwort) den Kandidaten-Zusatzfeldern (custom_field_definitions.key) zu. Die Titel
// unterscheiden sich je Kampagne stark ("wann_bist_du_am_besten_erreichbar?",
// "Erreichbarkeit", ...), daher Schlüsselwort-Regeln auf dem normalisierten Titel.
// Was keinem Feld entspricht, landet als Frage/Antwort in "extras" (-> Beschreibung).

export interface FormAnswersResult {
  fields: Record<string, string>
  extras: { question: string; answer: string }[]
  plz: string | null
  metaLeadId: string | null
  isTestLead: boolean
}

// Reihenfolge zählt: die erste passende Regel gewinnt.
const FIELD_RULES: { test: RegExp; keys: string[] }[] = [
  { test: /alter.*wohnort|wohnort.*alter/, keys: ["alter", "wohnort_plz"] },
  { test: /wohnort|postleitzahl|\bplz\b/, keys: ["wohnort_plz"] },
  { test: /^alter\b|wie alt/, keys: ["alter"] },
  { test: /ausbildung|abschluss|qualifikation/, keys: ["ausbildung"] },
  { test: /erreich/, keys: ["erreichbarkeit"] },
  { test: /wechselgrund|wechslegrund|warum.*wechsel|wechseln/, keys: ["wechselgrund"] },
  { test: /startdatum|starten|verfügbar|verfuegbar|kündigungsfrist|eintritt/, keys: ["verfuegbar_ab"] },
  { test: /erwart|wunsch|wünsch|wichtig.*arbeitgeber|arbeitgeber.*wichtig/, keys: ["erwartungen_neuer_ag"] },
  { test: /bereich.*(liebsten|besten)|lieblingsbereich|was machst du am liebsten/, keys: ["bevorzugter_bereich"] },
  { test: /wie viele? (ag|arbeitgeber)/, keys: ["anzahl_ag_5_jahre"] },
  { test: /datev/, keys: ["datev_erfahrung"] },
  { test: /branche/, keys: ["betreute_branchen"] },
  { test: /wie groß|größe|groesse|mitarbeiter.*kanzlei/, keys: ["kanzleigroesse"] },
  { test: /aktuell.*(steuerkanzlei|kanzlei)|(steuerkanzlei|kanzlei).*aktuell/, keys: ["aktuelle_steuerkanzlei"] },
]

// Bereits als feste Spalten übernommen (Name, E-Mail, Telefon) - nicht doppelt ablegen.
const CORE_TITLES =
  /^(deine? |ihre? )?(full ?name|vollständiger name|name|vor- und nachname|vorname|nachname|e ?-?mail(-? ?adresse)?|email|mail-?adresse|phone( ?number)?|telefon(nummer)?|handy(nummer)?|mobil(nummer)?)$/

// Kein Inhalt (Platzhalter, Einwilligungen).
const IGNORED_TITLES = /^(test|leer)$|datenschutz|einwilligung|ich (verstehe|akzeptiere|stimme)/

// Technische Werte aus Meta/Leadtable (Anzeigen-IDs usw.), ohne Mehrwert im Profil.
const TECHNICAL_TITLES = new Set([
  "adid", "adgroupid", "formid", "pageid", "leadgenid", "isorganic", "adname", "adsetname",
  "campaignid", "campaignname", "platform", "eventid", "createdtime", "id",
])

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/_/g, " ").replace(/[?:]+/g, " ").replace(/\s+/g, " ").trim()
}

function cleanAnswer(value: unknown): string | null {
  if (value === null || value === undefined) return null
  let text = String(value).trim()
  if (text === "" || /^-+$/.test(text)) return null
  // Meta-Auswahlwerte kommen als "0-2_jahre" / "eine_vergleichbare_qualifikation".
  if (!/\s/.test(text) && text.includes("_")) text = text.replace(/_/g, " ")
  return text
}

// Lesbarer Fragetitel für die Beschreibung ("wann_bist_du_am_besten_erreichbar?" ->
// "Wann bist du am besten erreichbar?").
function displayTitle(title: string): string {
  const t = title.replace(/_/g, " ").replace(/\s+/g, " ").trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function mapLeadFormAnswers(profile: Record<string, { title?: string; value?: unknown }> | undefined | null): FormAnswersResult {
  const result: FormAnswersResult = { fields: {}, extras: [], plz: null, metaLeadId: null, isTestLead: false }
  for (const [rawKey, entry] of Object.entries(profile ?? {})) {
    const title = entry?.title ?? rawKey
    const norm = normalizeTitle(title)
    const compact = norm.replace(/\s/g, "")
    const answer = cleanAnswer(entry?.value)
    if (answer?.toLowerCase().includes("<test lead")) result.isTestLead = true

    if (compact === "leadgenid") {
      if (answer) result.metaLeadId = answer
      continue
    }
    if (!answer || TECHNICAL_TITLES.has(compact) || CORE_TITLES.test(norm) || IGNORED_TITLES.test(norm)) continue

    const rule = FIELD_RULES.find((r) => r.test.test(norm))
    if (rule) {
      for (const key of rule.keys) result.fields[key] = result.fields[key] ? `${result.fields[key]}; ${answer}` : answer
      if (rule.keys.includes("wohnort_plz") && !result.plz) result.plz = answer.match(/\b\d{5}\b/)?.[0] ?? null
    } else {
      result.extras.push({ question: displayTitle(title), answer })
    }
  }
  return result
}
