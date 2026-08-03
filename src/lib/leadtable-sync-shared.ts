// Gemeinsame, umgebungsunabhängige Domänenlogik für den Leadtable-Sync - genutzt von
// scripts/leadtable-status-sync.ts, scripts/leadtable-description-import.ts,
// scripts/leadtable-backfill-fields.ts und der refreshLeadtableCandidateAction
// Server Action. Bewusst OHNE Supabase-Client, dotenv oder CLI-Parsing - das bleibt
// jeweils beim Aufrufer, da sich Überschreibverhalten und Orchestrierung
// unterscheiden (z.B. "immer überschreiben" bei manuellem Refresh vs. "nur wenn
// leer" beim einmaligen Bulk-Import).

export interface LeadtableSyncLead {
  _id: string
  // Flaches "status" existiert nur in der GET /lead/{leadID}-Antwort, nicht bei
  // searchLeadByMail - dort gibt es nur statusID.name. Beide werden unterstützt,
  // statusID.name hat Vorrang, da in beiden Endpunkten vorhanden.
  status?: string
  statusID?: { name?: string }
  description?: string
  modifiedData?: Record<string, unknown>
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("429") && attempt < retries - 1) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
  throw new Error("unreachable")
}

// 1:1-Mapping der Leadtable-Statusnamen auf unsere 8 dafür vorgesehenen Kandidatenwerk-
// Status ("vorgestellt" hat keine Leadtable-Entsprechung, wird hier nie gesetzt).
export const LEADTABLE_STATUS_MAP: Record<string, string> = {
  Unbearbeitet: "neu",
  Vorqualifiziert: "vorqualifiziert",
  "Nicht erreicht": "nicht_erreicht",
  "2x nicht erreicht + Mail": "nicht_erreicht_mail",
  "In Kontakt": "in_kontakt",
  Vorstellungsgespräch: "interview",
  Absage: "abgelehnt",
  "aktuell kein Interesse": "abgelehnt",
  Eingestellt: "platziert",
}

export function leadtableStatusName(lead: Pick<LeadtableSyncLead, "status" | "statusID">): string {
  return lead.statusID?.name ?? lead.status ?? ""
}

export function mapLeadtableStatus(lead: Pick<LeadtableSyncLead, "status" | "statusID">): string | undefined {
  return LEADTABLE_STATUS_MAP[leadtableStatusName(lead)]
}

// Leadtables description-Feld ist rohes Quill-Editor-HTML (<p>, <br/>, <ol>/<li
// data-list="bullet">, HTML-Entities wie &gt;). Der API-eigene plainDescription-
// Query-Parameter entfernt zwar Tags, fügt aber KEINE Trenner zwischen Absätzen/
// Listenpunkten ein - mehrere Notizen verschmelzen dadurch zu einem Textblock ohne
// Leerzeichen (getestet, z.B. "...gemachtaktuell..."). Deshalb wird hier bewusst das
// rohe HTML geholt und selbst in lesbaren Text mit Zeilenumbrüchen umgewandelt.
// Manche Notizen hängen mehrere chronologische Einträge ohne jedes Trenn-Tag
// aneinander (z.B. "...geändert29.07.26 [19:17 Uhr]: nicht erreicht..." - im
// rohen HTML dort schlicht kein Tag vorhanden). Als Sicherheitsnetz wird vor
// jedem Datums-Präfix im Format "TT.MM.JJ[JJ] [[HH:MM Uhr]]:" ein Zeilenumbruch
// eingefügt, falls dort noch keiner steht - dieses Format ist spezifisch genug,
// um nicht versehentlich mitten in normalem Fließtext zu greifen.
const DATE_PREFIX_RE = /\d{2}\.\d{2}\.(?:\d{2}|\d{4})\s*(?:\[\d{1,2}:\d{2}\s*Uhr\])?:/g

export function htmlDescriptionToPlainText(html: string): string {
  let text = html
    .replace(/<span class="ql-ui"[^>]*>\s*<\/span>/g, "")
    .replace(/<li[^>]*>/g, "- ")
    .replace(/<\/li>/g, "\n")
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/?(p|div)[^>]*>/g, (m) => (m.startsWith("</") ? "\n" : ""))
    .replace(/<[^>]+>/g, "")

  text = text
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")

  text = text.replace(DATE_PREFIX_RE, (match, offset: number, full: string) => {
    const precedingChar = full[offset - 1]
    const alreadyAtLineStart = offset === 0 || precedingChar === "\n"
    return alreadyAtLineStart ? match : `\n${match}`
  })

  return text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// Verifizierte Feld-Zuordnung (siehe Bestandsaufnahme, 50-Kandidaten-Stichprobe):
//   q_rwi3pf  -> ausbildung       (Plausibilitäts-Check: braucht mind. 3 Buchstaben,
//                                  da diese ID in mind. 1 Kampagne etwas anderes bedeutet)
//   q_gy0zcd  -> erreichbarkeit
//   q_x8gp0p  -> verfuegbar_ab
//   q_11kc69j -> wechselgrund
export const LEADTABLE_CUSTOM_FIELD_MAP: Record<string, string> = {
  q_gy0zcd: "erreichbarkeit",
  q_x8gp0p: "verfuegbar_ab",
  q_11kc69j: "wechselgrund",
}
export const LEADTABLE_AUSBILDUNG_QUESTION_ID = "q_rwi3pf"
export const LEADTABLE_AUSBILDUNG_FIELD = "ausbildung"

// Mindestens 3 Buchstaben (a-z, inkl. Umlaute/ß) — filtert reine Zahlen-/Zeitangaben
// wie den bekannten "10-11"-Ausreißer aus der Verifikation.
const LOOKS_LIKE_TEXT_RE = /[a-zäöüßA-ZÄÖÜ]{3,}/

// Gibt nur die NEUEN Felder zurück (Werte aus modifiedData, die den Plausibilitäts-
// Check bestehen). Merge mit bestehenden custom_fields (existing gewinnt bei
// Konflikt) bleibt bewusst beim Aufrufer.
export function extractLeadtableCustomFields(modifiedData: Record<string, unknown> | undefined): Record<string, string> {
  const newFields: Record<string, string> = {}
  if (!modifiedData) return newFields

  for (const [questionId, fieldName] of Object.entries(LEADTABLE_CUSTOM_FIELD_MAP)) {
    const value = modifiedData[questionId]
    if (typeof value === "string" && value.trim() !== "") {
      newFields[fieldName] = value
    }
  }

  const ausbildungValue = modifiedData[LEADTABLE_AUSBILDUNG_QUESTION_ID]
  if (typeof ausbildungValue === "string" && LOOKS_LIKE_TEXT_RE.test(ausbildungValue)) {
    newFields[LEADTABLE_AUSBILDUNG_FIELD] = ausbildungValue
  }

  return newFields
}
