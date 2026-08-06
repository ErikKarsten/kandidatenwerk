// Gemeinsame, umgebungsunabhängige Domänenlogik für den Leadtable-Sync - genutzt von
// scripts/leadtable-status-sync.ts, scripts/leadtable-description-import.ts,
// scripts/leadtable-backfill-fields.ts, scripts/leadtable-full-sync.ts und der
// refreshLeadtableCandidateAction Server Action. Anders als der Name "shared" vielleicht
// vermuten lässt, importiert dieses Modul bewusst `leadtableFetch` (für
// findLeadByEmailWithFallback) und das Anthropic-SDK (für
// extractCustomFieldsFromDescriptionAI) - bleibt aber weiterhin OHNE Supabase-Client,
// dotenv oder CLI-Parsing, das bleibt jeweils beim Aufrufer, da sich
// Überschreibverhalten und Orchestrierung unterscheiden (z.B. "immer überschreiben" bei
// manuellem Refresh vs. "nur wenn leer" beim einmaligen Bulk-Import).

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { leadtableFetch } from "./leadtable-client"
import { FIXED_CUSTOM_FIELDS } from "./candidate-custom-fields"

export interface LeadtableSyncLead {
  _id: string
  email?: string
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

interface LeadtableLeadsPage {
  pages?: { totalPages: number }
  leads?: LeadtableSyncLead[]
}

async function fetchAllCampaignLeads(leadtableCampaignId: string): Promise<LeadtableSyncLead[]> {
  const first = await withRetry(() =>
    leadtableFetch<LeadtableLeadsPage>(`/lead/campaign/${leadtableCampaignId}`, { page: 1, limit: 100 })
  )
  let leads = first.leads ?? []
  const totalPages = first.pages?.totalPages ?? 1
  for (let page = 2; page <= totalPages; page++) {
    await sleep(150)
    const next = await withRetry(() =>
      leadtableFetch<LeadtableLeadsPage>(`/lead/campaign/${leadtableCampaignId}`, { page, limit: 100 })
    )
    leads = leads.concat(next.leads ?? [])
  }
  return leads
}

// searchLeadByMail hat eine beobachtete Indexierungslücke: manche Leads (unabhängig von
// der Quelle metaLeadAds/onePage) liefern dort ein 404, obwohl sie nachweislich existieren
// und über die kampagnenbasierte Lead-Liste auffindbar sind (siehe Diagnose Alicia Keinz,
// 2026-08-04). Dieser Fallback sucht bei fehlgeschlagener E-Mail-Suche zusätzlich direkt
// in der Leadtable-Kampagne (case-insensitiver E-Mail-Vergleich), FALLS eine
// Leadtable-Kampagnen-ID übergeben wurde - ohne die bleibt es beim bisherigen Verhalten
// (null = nicht gefunden). Echte Fehler (Netzwerk, 5xx, nach Retry immer noch 429) werden
// NICHT geschluckt, sondern weitergeworfen - nur ein 404 auf die Suche selbst löst den
// Fallback aus.
export async function findLeadByEmailWithFallback(
  email: string,
  leadtableCampaignId?: string | null
): Promise<LeadtableSyncLead | null> {
  let lead: LeadtableSyncLead | null = null

  try {
    const resp = await withRetry(() =>
      leadtableFetch<{ leads: LeadtableSyncLead[] }>(`/searchLeadByMail/${encodeURIComponent(email)}`)
    )
    lead = resp.leads[0] ?? null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!message.includes("404")) throw err
  }

  if (lead) return lead
  if (!leadtableCampaignId) return null

  const normalizedEmail = email.toLowerCase()
  const campaignLeads = await fetchAllCampaignLeads(leadtableCampaignId)
  return campaignLeads.find((l) => l.email?.toLowerCase() === normalizedEmail) ?? null
}

// Zod-Schema für die KI-Extraktion: alle 12 bekannten Felder + ein Sammelfeld für
// Zusatzinfos, die zu keiner der 12 Fragen passen. Bewusst ALLE Felder .optional() -
// das Modell soll Felder komplett weglassen dürfen, statt sie zu raten (siehe Prompt).
const ExtractedFieldsSchema = z.object({
  ...Object.fromEntries(FIXED_CUSTOM_FIELDS.map((f) => [f.key, z.string().optional()])),
  sonstige_hinweise_ki: z.string().optional(),
})

// KI-gestützte Zusatzfelder-Extraktion aus der Leadtable-Beschreibung (Freitext). Nutzt
// Claude Haiku 4.5 (günstig, für diese einfache Extraktionsaufgabe ausreichend) mit
// strukturierter JSON-Ausgabe (output_config.format via zodOutputFormat) - das ist die
// primäre Absicherung gegen unparsbare Antworten, der Prompt-Hinweis "Gib NUR JSON
// zurück" ist zusätzliche Verstärkung.
//
// WICHTIGE REGEL: überschreibt NIEMALS bereits gesetzte custom_fields-Werte - egal ob
// sie vom bisherigen Regex-Backfill stammen oder manuell im UI eingetragen wurden. Der
// Prompt weist das Modell an, nichts zu raten; zusätzlich filtert diese Funktion das
// Ergebnis nach existingFields (Sicherheitsnetz gegen versehentliches Überschreiben,
// falls das Modell dennoch ein bereits gesetztes Feld zurückgibt).
export async function extractCustomFieldsFromDescriptionAI(
  description: string | null | undefined,
  existingFields: Record<string, string>
): Promise<Record<string, string>> {
  const trimmedDescription = (description ?? "").trim()
  if (trimmedDescription === "") return {}

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn(
      "[extractCustomFieldsFromDescriptionAI] ANTHROPIC_API_KEY nicht gesetzt - KI-Extraktion übersprungen."
    )
    return {}
  }

  const fieldList = FIXED_CUSTOM_FIELDS.map((f) => `- ${f.label} (${f.key})`).join("\n")
  const prompt = `Hier ist ein Freitext über einen Bewerber. Extrahiere, falls vorhanden, Antworten zu folgenden Fragen (JSON-Feldname in Klammern):
${fieldList}

Gib NUR JSON zurück mit den Feldern, die du im Text findest - lass Felder komplett weg, wenn der Text dazu nichts hergibt, rate nichts. Falls du zusätzliche relevante Infos findest, die zu KEINER der Fragen passen, fasse sie kurz unter einem zusätzlichen Feld "sonstige_hinweise_ki" zusammen.

Freitext:
"""
${trimmedDescription}
"""`

  let parsed: z.infer<typeof ExtractedFieldsSchema> | null
  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.parse({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(ExtractedFieldsSchema) },
    })
    parsed = response.parsed_output
  } catch (err) {
    console.warn(
      "[extractCustomFieldsFromDescriptionAI] Anthropic-API-Fehler:",
      err instanceof Error ? err.message : err
    )
    return {}
  }

  if (!parsed) return {}

  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string" || value.trim() === "") continue
    const alreadySet = typeof existingFields[key] === "string" && existingFields[key].trim() !== ""
    if (alreadySet) continue
    result[key] = value.trim()
  }
  return result
}
