// Kunde aus Close übernehmen, ohne Zapier (Paket 30, T-127). Auslöser: Lead-Status
// "Gewonnen" oder "Folgebesprechung zum SC vereinbart (Angebot verschickt)" (Webhook
// activity.lead_status_change). Ablauf in Schritten über den Cronjob close-meetings
// (Telefonate zu transkribieren dauert):
//   offen        -> Lead per API lesen, Kunde anlegen/verknüpfen (processCloseWebhook wie
//                   bisher beim Zapier-POST), kompletten Verlauf in die Warteschlange
//   aktivitaeten -> warten, bis alle Aktivitäten des Leads verarbeitet sind
//   profil       -> KI liest Lead-Felder, Notizen, eigene Aktivitäten, Besprechungen und
//                   Telefon-Transkripte und füllt Kanzleiprofil und Stellen (nur Lücken)
//   erledigt
import type { SupabaseClient } from "@supabase/supabase-js"
import { closeGet, leadFieldLabels, type CloseLead } from "@/lib/close-api"
import { importLeadHistory, leadActivityTexts } from "@/lib/close-sync"
import { closeLeadUrl, processCloseWebhook, type CloseWebhookPayload, type PositionPayload } from "@/lib/close-webhook"
import { PROFILE_FIELDS } from "@/lib/client-project"
import { generateText } from "@/lib/llm"

const MAX_ATTEMPTS = 3
// Höchstens so viele Zeichen je Quelle bzw. insgesamt an die KI.
const MAX_SOURCE_CHARS = 40_000
const MAX_TOTAL_CHARS = 250_000

// Status-Texte in Close, die die Übernahme auslösen (Close schreibt "Folgebescprechung").
export function isOnboardingStatus(label: string | null | undefined): boolean {
  const l = (label ?? "").toLowerCase()
  return l === "gewonnen" || l.startsWith("folgebesprechung zum sc") || l.startsWith("folgebescprechung zum sc")
}

export async function queueOnboarding(db: SupabaseClient, leadId: string, statusLabel: string): Promise<void> {
  const { error } = await db
    .from("close_onboarding")
    .upsert({ lead_id: leadId, trigger_status: statusLabel, status: "offen", attempts: 0, error: null, updated_at: new Date().toISOString() }, { onConflict: "lead_id" })
  if (error) throw new Error(error.message)
}

const text = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const t = (Array.isArray(v) ? v.join(", ") : String(v)).trim()
  return t || undefined
}

// Stammdaten direkt aus dem Lead (ohne KI).
export function payloadFromLead(lead: CloseLead, statusLabel: string | null): CloseWebhookPayload {
  const address = lead.addresses?.[0]
  const contact = lead.contacts?.[0]
  return {
    close_lead_id: lead.id,
    close_status: statusLabel ?? lead.status_label ?? undefined,
    close_url: closeLeadUrl(lead.id),
    firma: text(lead.display_name),
    website: text(lead.url),
    strasse: text(address?.address_1),
    plz: text(address?.zipcode),
    ort: text(address?.city),
    telefon: text(contact?.phones?.[0]?.phone),
    email: text(contact?.emails?.[0]?.email),
    ansprechpartner_name: text(contact?.name),
    ansprechpartner_email: text(contact?.emails?.[0]?.email),
    ansprechpartner_telefon: text(contact?.phones?.[0]?.phone),
    ansprechpartner_position: text(contact?.title),
  }
}

function leadFieldsText(lead: CloseLead, labels: Map<string, string>): string {
  return Object.entries(lead)
    .filter(([key, value]) => key.startsWith("custom.") && text(value))
    .map(([key, value]) => `${labels.get(key.slice("custom.".length)) ?? key}: ${text(value)}`)
    .join("\n")
}

const SYSTEM = `Du befüllst für Endlich Mitarbeiter (Recruiting für Steuerkanzleien) das Kanzleiprofil und die gesuchten Stellen eines neuen Kunden. Grundlage sind alle Informationen aus dem Vertriebs-CRM Close: Lead-Felder, Notizen, Formulare aus Gesprächen, Zusammenfassungen von Besprechungen und automatische Transkripte von Telefonaten (mit Erkennungsfehlern).

Regeln:
- Nur übernehmen, was in den Quellen steht. Nichts erfinden. Unbekanntes weglassen (Feld nicht ausgeben).
- Neuere Aussagen haben Vorrang vor älteren.
- Kanzleiprofil-Texte (kurzbeschreibung, intro) sachlich und positiv, für Bewerber lesbar.
- Interne Wünsche und Ausschlüsse der Kanzlei (z.B. "keine Berufsanfänger", Gehaltsgrenzen, Gründe für die Suche) gehören in painpoints oder ziele_zusammenarbeit, nicht in die Stellen.
- Stellen: aufgaben und anforderungen als Stichpunkte, ein Punkt pro Zeile, bewerbergerecht formuliert. berufsbild ist einer von: steuerfachangestellte, steuerfachwirt, bilanzbuchhalter, steuerberater, sonstige.
- benefits als Liste kurzer Stichpunkte, ohne Bedingungen wie "wenn es passt".
- vertragsstart als JJJJ-MM-TT, laufzeit_monate als Zahl - nur wenn eindeutig genannt.

Antworte nur mit JSON in dieser Form (alle Felder optional):
{
  "profil": { <Feldschlüssel>: "Text" },
  "benefits": ["..."],
  "vertragsstart": "JJJJ-MM-TT",
  "laufzeit_monate": 12,
  "stellen": [{ "titel": "", "berufsbild": "", "plz": "", "ort": "", "arbeitszeit": "", "berufserfahrung": "", "software": "", "gehalt": "", "start": "", "aufgaben": "", "anforderungen": "" }]
}`

interface ProfileAnswer {
  profil?: Record<string, unknown>
  benefits?: unknown
  vertragsstart?: unknown
  laufzeit_monate?: unknown
  stellen?: unknown
}

// KI-Antwort in die Felder des bisherigen Zapier-POST übersetzen.
export function payloadFromAnswer(raw: string): CloseWebhookPayload {
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return {}
  let answer: ProfileAnswer
  try {
    answer = JSON.parse(match[0]) as ProfileAnswer
  } catch {
    return {}
  }
  const out: Record<string, unknown> = {}
  const allowed = new Set([...PROFILE_FIELDS.map((f) => f.key), "standorte"])
  for (const [key, value] of Object.entries(answer.profil ?? {})) {
    if (allowed.has(key) && text(value)) out[key] = text(value)
  }
  if (Array.isArray(answer.benefits)) out.benefits = answer.benefits.map((b) => text(b)).filter(Boolean)
  if (text(answer.vertragsstart)) out.vertragsstart = text(answer.vertragsstart)
  if (Number.isInteger(Number(answer.laufzeit_monate)) && Number(answer.laufzeit_monate) > 0) out.laufzeit_monate = Number(answer.laufzeit_monate)
  if (Array.isArray(answer.stellen)) {
    out.stellen_json = (answer.stellen as Record<string, unknown>[])
      .filter((p) => p && typeof p === "object" && text(p.titel))
      .map((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, text(v)])) as PositionPayload)
  }
  return out as CloseWebhookPayload
}

async function buildProfilePayload(db: SupabaseClient, lead: CloseLead): Promise<CloseWebhookPayload> {
  const [labels, activities] = await Promise.all([leadFieldLabels(), leadActivityTexts(db, lead.id)])
  return extractProfile(lead, labels, activities)
}

// KI-Auswertung aller Quellen eines Leads (ohne Datenbank, testbar).
export async function extractProfile(
  lead: CloseLead,
  labels: Map<string, string>,
  activities: Awaited<ReturnType<typeof leadActivityTexts>>
): Promise<CloseWebhookPayload> {
  const typeLabel = { meeting: "Besprechung (Zusammenfassung)", call: "Telefonat (Transkript)", note: "Notiz", custom: "Formular", status: "Status" }
  const parts: string[] = [
    `Kanzlei: ${lead.display_name ?? ""}`,
    lead.description ? `Beschreibung im Lead:\n${lead.description}` : "",
    `Lead-Felder:\n${leadFieldsText(lead, labels) || "(keine)"}`,
    ...activities.map((a) => `### ${typeLabel[a.type]}${a.title ? ` – ${a.title}` : ""}${a.at ? ` (${a.at.slice(0, 10)})` : ""}\n${a.text.slice(0, MAX_SOURCE_CHARS)}`),
  ].filter(Boolean)
  let prompt = parts.join("\n\n")
  if (prompt.length > MAX_TOTAL_CHARS) prompt = prompt.slice(prompt.length - MAX_TOTAL_CHARS)
  const fieldList = PROFILE_FIELDS.map((f) => `- ${f.key}: ${f.label}${f.group === "intern" ? " (intern)" : ""}`).join("\n")
  const raw = await generateText({
    tier: "smart",
    system: `${SYSTEM}\n\nFeldschlüssel für "profil":\n${fieldList}\n- standorte: Adressen aller Standorte`,
    prompt,
    maxTokens: 4000,
    timeoutMs: 180_000,
  })
  return payloadFromAnswer(raw)
}

interface OnboardingRow {
  lead_id: string
  client_id: string | null
  trigger_status: string | null
  status: string
  attempts: number
}

async function step(db: SupabaseClient, row: OnboardingRow): Promise<string> {
  const lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(row.lead_id)}/`)
  if (!lead) throw new Error("Lead nicht gefunden (CLOSE_API_KEY?).")

  if (row.status === "offen") {
    const result = await processCloseWebhook(db, payloadFromLead(lead, row.trigger_status))
    const found = await importLeadHistory(db, lead.id, result.clientId)
    await db.from("close_onboarding").update({ client_id: result.clientId, status: "aktivitaeten", updated_at: new Date().toISOString() }).eq("lead_id", row.lead_id)
    return `Kunde ${result.outcome}, ${found} Aktivitäten vorgemerkt`
  }

  if (row.status === "aktivitaeten") {
    const { count } = await db.from("close_meeting_summaries").select("close_activity_id", { count: "exact", head: true }).eq("lead_id", row.lead_id).in("status", ["offen", "in_arbeit"])
    if ((count ?? 0) > 0) return `${count} Aktivitäten offen`
    await db.from("close_onboarding").update({ status: "profil", updated_at: new Date().toISOString() }).eq("lead_id", row.lead_id)
    return "Aktivitäten verarbeitet"
  }

  // profil
  const fromLead = Object.fromEntries(Object.entries(payloadFromLead(lead, row.trigger_status)).filter(([, v]) => v !== undefined))
  const payload = { ...(await buildProfilePayload(db, lead)), ...fromLead } as CloseWebhookPayload
  const result = await processCloseWebhook(db, payload)
  await db.from("client_comments").insert({
    client_id: result.clientId,
    author_id: null,
    kind: "system",
    content: `Kanzleiprofil und Stellen aus den Close-Gesprächen vorbefüllt (KI) - bitte prüfen, bevor das Profil abgeschlossen wird.`,
  })
  await db.from("close_onboarding").update({ status: "erledigt", updated_at: new Date().toISOString() }).eq("lead_id", row.lead_id)
  return "Profil befüllt"
}

export async function processOnboarding(db: SupabaseClient, deadline: number): Promise<{ steps: number; failed: number }> {
  const { data } = await db.from("close_onboarding").select("lead_id, client_id, trigger_status, status, attempts").in("status", ["offen", "aktivitaeten", "profil"]).order("created_at").limit(5)
  const result = { steps: 0, failed: 0 }
  for (const row of (data ?? []) as OnboardingRow[]) {
    if (deadline - Date.now() < (row.status === "profil" ? 120_000 : 60_000)) break
    try {
      await step(db, row)
      result.steps++
    } catch (err) {
      const attempts = row.attempts + 1
      await db
        .from("close_onboarding")
        .update({ attempts, status: attempts >= MAX_ATTEMPTS ? "fehler" : row.status, error: err instanceof Error ? err.message : String(err), updated_at: new Date().toISOString() })
        .eq("lead_id", row.lead_id)
      result.failed++
    }
  }
  return result
}
