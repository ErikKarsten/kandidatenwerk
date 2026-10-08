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

// triggeredAt: Zeitpunkt des Statuswechsels - ab "Gewonnen" entstehen Kommentare.
export async function queueOnboarding(db: SupabaseClient, leadId: string, statusLabel: string, triggeredAt?: string | null): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await db
    .from("close_onboarding")
    .upsert(
      { lead_id: leadId, trigger_status: statusLabel, triggered_at: triggeredAt ?? now, status: "offen", attempts: 0, error: null, updated_at: now },
      { onConflict: "lead_id" }
    )
  if (error) throw new Error(error.message)
}

const text = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined
  const t = (Array.isArray(v) ? v.join(", ") : String(v)).trim()
  return t || undefined
}

// In Close steht im Feld "Titel" oft nur die Anrede - die ist keine Position.
export function positionOf(title: string | null | undefined): string | undefined {
  const t = text(title)
  if (!t || /^(herr|frau|hr\.?|fr\.?|divers|mr\.?|mrs\.?|ms\.?)$/i.test(t)) return undefined
  return t
}

// Stammdaten direkt aus dem Lead (ohne KI).
export function payloadFromLead(lead: CloseLead, statusLabel: string | null): CloseWebhookPayload {
  const address = lead.addresses?.[0]
  // Primärer Kontakt: erster mit E-Mail (der erste Kontakt in Close hat oft keine),
  // Telefon vom Kontakt selbst oder sonst die erste Nummer im Lead.
  const contacts = lead.contacts ?? []
  const contact = contacts.find((c) => c.emails?.length) ?? contacts[0]
  const email = text(contact?.emails?.[0]?.email)
  const phone = text(contact?.phones?.[0]?.phone) ?? text(contacts.find((c) => c.phones?.length)?.phones?.[0]?.phone)
  return {
    close_lead_id: lead.id,
    close_status: statusLabel ?? lead.status_label ?? undefined,
    close_url: closeLeadUrl(lead.id),
    firma: text(lead.display_name),
    website: text(lead.url),
    strasse: text(address?.address_1),
    plz: text(address?.zipcode),
    ort: text(address?.city),
    telefon: phone,
    email,
    ansprechpartner_name: text(contact?.name),
    ansprechpartner_email: email,
    ansprechpartner_telefon: phone,
    ansprechpartner_position: positionOf(contact?.title),
  }
}

function leadFieldsText(lead: CloseLead, labels: Map<string, string>): string {
  return Object.entries(lead)
    .filter(([key, value]) => key.startsWith("custom.") && text(value))
    .map(([key, value]) => `${labels.get(key.slice("custom.".length)) ?? key}: ${text(value)}`)
    .join("\n")
}

// Feldbeschreibungen nach dem bisherigen Zapier-Prompt (07.10.2026). Bewusst NICHT
// automatisch: Vertragsstart, Laufzeit, Ansprechpartner für Bewerbungsgespräche und Notizen
// aus dem Vertrieb - die pflegt der Key Account Manager im Projekt-Reiter (Entscheidung 07.10.2026).
const PROFILE_FIELD_GUIDE: Record<string, string> = {
  kurzbeschreibung: "Ein Satz über die Kanzlei: Art, Größe, Ort, Besonderheit. Beispiel: Moderne Steuerkanzlei mit 15 Mitarbeitenden in Köln, spezialisiert auf Ärzte.",
  intro: "3–5 Sätze, mit denen wir die Kanzlei einem Bewerber vorstellen: wer sie ist, was sie ausmacht, Arbeitsweise und Kultur. Positiv formuliert, nur Fakten aus den Gesprächen.",
  mitarbeiterzahl: "Anzahl Mitarbeitende bzw. Teamgröße. Beispiel: ca. 20, davon 3 Steuerberater",
  standorte: "Standort(e) mit Straße, PLZ und Ort, soweit genannt; mehrere durch Semikolon trennen. Beispiel: Hauptstraße 5, 50667 Köln; 53111 Bonn",
  mandantenstruktur: "Mandanten, Branchen und fachliche Schwerpunkte. Beispiel: Überwiegend Handwerk und Heilberufe; Schwerpunkt Lohn und Jahresabschlüsse",
  software: "Eingesetzte Programme. Beispiel: DATEV, DATEV Unternehmen online",
  arbeitszeiten: "Arbeitszeitmodell. Beispiel: Gleitzeit, Teilzeit ab 25 Std. möglich, Freitag ab 13 Uhr frei",
  homeoffice: "Regelung zu Homeoffice bzw. mobilem Arbeiten. Beispiel: 2 Tage pro Woche nach Einarbeitung",
  gehaltsgefuege: "Intern: was die Kanzlei zahlt (Spannen je Rolle/Erfahrung, 13. Gehalt, Bonus, Gehaltsrunden), Beträge genau. Beispiel: Steuerfachangestellte 42.000–52.000 € brutto/Jahr je nach Erfahrung, 13. Monatsgehalt",
  painpoints:
    "Intern für den Key Account Manager: Warum arbeitet die Kanzlei mit uns? Probleme bei der Personalsuche (Stellen lange offen, Überlastung, Portale erfolglos, Wachstum, Ruhestand). Stichpunkte, jede Zeile beginnt mit \"- \".",
  ziele_zusammenarbeit:
    "Intern für den Key Account Manager: Was erwartet die Kanzlei konkret von uns: Anzahl Einstellungen, Zeitrahmen, gewünschtes Profil inkl. Ausschlüsse (z.B. keine Berufsanfänger), woran sie Erfolg misst. Stichpunkte, jede Zeile beginnt mit \"- \".",
}

const SYSTEM = `Du bist Assistent eines Recruiting-Dienstleisters für Steuerkanzleien (Endlich Mitarbeiter). Du bekommst alle vorhandenen Informationen zu einer Steuerkanzlei: aus unserem Vertriebs-CRM Close (Lead-Felder, Notizen, Formulare aus Gesprächen, Zusammenfassungen von Besprechungen, automatische Transkripte von Telefonaten mit Erkennungsfehlern), aus unserem bisherigen Projektmanagement ClickUp (Beschreibung und Kommentare) und ggf. Texte von der Website der Kanzlei.

Deine Aufgabe: Arbeite daraus das Kanzleiprofil für unser internes System "Kandidatenwerk" heraus. Daraus entstehen später Stellenanzeigen und die Briefings für unsere Bewerber-Telefonisten. Außerdem halten wir fest, warum die Kanzlei mit uns zusammenarbeitet.

REGELN
1. Verwende ausschließlich Informationen, die in den Quellen tatsächlich vorkommen. Nichts erfinden, nichts schätzen, nichts verallgemeinern.
2. Ist eine Information nicht vorhanden, lass das Feld weg.
3. Schreibe auf Deutsch, sachlich und konkret. Übernimm Zahlen, Namen, Programme und Beträge genau so, wie sie genannt wurden.
4. Gibt es widersprüchliche Aussagen, gilt die Aussage aus der neuesten Quelle (Datum steht an jeder Quelle).
5. Jedes Feld enthält nur den reinen Inhalt – keine Feldnamen, keine Einleitung, keine Anführungszeichen drumherum.
6. Nur Inhalte, die für die Betreuung der Kanzlei und die Kandidatensuche relevant sind. Weglassen: Abläufe aus dem Vertrieb und Organisatorisches wie Termine (z.B. Portaleinweisung, Folgetermine), Zahlungen, Karriereseite, Referenzen, Marketingmaterial, Vertragsdetails.
7. Die Website ist eine Selbstdarstellung: gut für kurzbeschreibung, intro, mitarbeiterzahl, standorte, mandantenstruktur, software und benefits. painpoints und ziele_zusammenarbeit nur aus Close und ClickUp. Bei Widersprüchen gelten Close und ClickUp.
8. Interne Wünsche und Ausschlüsse der Kanzlei (z.B. "keine Berufsanfänger", Gehaltsgrenzen, Gründe für die Suche) gehören in painpoints oder ziele_zusammenarbeit - nie in aufgaben oder anforderungen einer Stelle.

FELDER FÜR "profil"
#FELDER#

BENEFITS
"benefits": Liste aller Vorteile für Mitarbeitende als kurze Stichpunkte, ohne Bedingungen wie "wenn es passt". Beispiel: ["Jobrad", "30 Tage Urlaub", "Fortbildungsbudget", "betriebliche Altersvorsorge"]

STELLEN
"stellen": alle gesuchten Stellen. Schlüssel (unbekannte weglassen): titel, berufsbild, plz, ort, umkreis_km, arbeitszeit, berufserfahrung, software, gehalt, start, aufgaben, anforderungen.
- berufsbild ist genau einer dieser Werte: Steuerfachangestellte, Steuerfachwirt, Bilanzbuchhalter, Steuerberater, Sonstige.
- umkreis_km ist eine Zahl (Kilometer, in denen Bewerber wohnen dürfen).
- gehalt: Gehalt für genau diese Stelle (intern, geht nie in die Anzeige).
- aufgaben und anforderungen: bewerbergerechte Stichpunkte, ein Punkt pro Zeile.
Beispiel: [{"titel":"Steuerfachangestellte (m/w/d)","berufsbild":"Steuerfachangestellte","plz":"50667","ort":"Köln","umkreis_km":25,"arbeitszeit":"Vollzeit oder Teilzeit ab 30 Std.","berufserfahrung":"ab 2 Jahre","software":"DATEV","gehalt":"45.000–52.000 € brutto/Jahr","start":"ab sofort","aufgaben":"Finanz- und Lohnbuchhaltung\nJahresabschlüsse","anforderungen":"Abgeschlossene Ausbildung als Steuerfachangestellte/r\nGute DATEV-Kenntnisse"}]

Antworte nur mit JSON: {"profil": {...}, "benefits": [...], "stellen": [...]}`.replace(
  "#FELDER#",
  Object.entries(PROFILE_FIELD_GUIDE)
    .map(([key, guide]) => `- ${key}: ${guide}`)
    .join("\n")
)

interface ProfileAnswer {
  profil?: Record<string, unknown>
  benefits?: unknown
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
  const allowed = new Set(Object.keys(PROFILE_FIELD_GUIDE))
  for (const [key, value] of Object.entries(answer.profil ?? {})) {
    if (allowed.has(key) && text(value)) out[key] = text(value)
  }
  if (Array.isArray(answer.benefits)) out.benefits = answer.benefits.map((b) => text(b)).filter(Boolean)
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
  return extractProfileFromSources(lead.display_name ?? "", [...closeLeadSources(lead, labels), ...activitySources(activities)])
}

export interface ProfileSource {
  label: string
  at?: string | null
  text: string
}

const ACTIVITY_LABEL = { meeting: "Close: Besprechung (Zusammenfassung)", call: "Close: Telefonat (Transkript)", note: "Close: Notiz", custom: "Close: Formular", status: "Close: Status" }

export function activitySources(activities: Awaited<ReturnType<typeof leadActivityTexts>>): ProfileSource[] {
  return activities.map((a) => ({ label: `${ACTIVITY_LABEL[a.type]}${a.title ? ` – ${a.title}` : ""}`, at: a.at, text: a.text }))
}

export function closeLeadSources(lead: CloseLead, labels: Map<string, string>): ProfileSource[] {
  return [
    lead.description ? { label: "Close: Beschreibung im Lead", text: String(lead.description) } : null,
    { label: "Close: Lead-Felder", text: leadFieldsText(lead, labels) || "(keine)" },
  ].filter((x): x is ProfileSource => !!x)
}

// KI-Auswertung beliebiger Quellen (Close, ClickUp, Website) - ohne Datenbank, testbar.
export async function extractProfileFromSources(name: string, sources: ProfileSource[]): Promise<CloseWebhookPayload> {
  const parts = [`Kanzlei: ${name}`, ...sources.filter((x) => x.text.trim()).map((x) => `### ${x.label}${x.at ? ` (${x.at.slice(0, 10)})` : ""}\n${x.text.slice(0, MAX_SOURCE_CHARS)}`)]
  let prompt = parts.join("\n\n")
  if (prompt.length > MAX_TOTAL_CHARS) prompt = prompt.slice(prompt.length - MAX_TOTAL_CHARS)
  const raw = await generateText({ tier: "smart", system: SYSTEM, prompt, maxTokens: 4000, timeoutMs: 180_000 })
  return payloadFromAnswer(raw)
}

interface OnboardingRow {
  lead_id: string
  client_id: string | null
  trigger_status: string | null
  triggered_at: string | null
  status: string
  attempts: number
}

async function step(db: SupabaseClient, row: OnboardingRow): Promise<string> {
  const lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(row.lead_id)}/`)
  if (!lead) throw new Error("Lead nicht gefunden (CLOSE_API_KEY?).")

  if (row.status === "offen") {
    const result = await processCloseWebhook(db, payloadFromLead(lead, row.trigger_status))
    // Kommentare erst ab "Gewonnen"; bei "Folgebesprechung" nur Grundlage fürs Profil.
    const commentsFrom = /gewonnen/i.test(row.trigger_status ?? "") ? row.triggered_at : null
    const found = await importLeadHistory(db, lead.id, result.clientId, commentsFrom)
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

// Schritte je Kunde, solange es vorangeht und Zeit bleibt (Paket 33): "aktivitaeten" ->
// "profil" -> "erledigt" laufen im selben Cron-Lauf, sobald alle Aktivitäten fertig sind.
export async function processOnboarding(db: SupabaseClient, deadline: number): Promise<{ steps: number; failed: number }> {
  const { data } = await db
    .from("close_onboarding")
    .select("lead_id, client_id, trigger_status, triggered_at, status, attempts")
    .in("status", ["offen", "aktivitaeten", "profil"])
    .order("created_at")
    .limit(10)
  const result = { steps: 0, failed: 0 }
  for (const initial of (data ?? []) as OnboardingRow[]) {
    let row = initial
    for (let i = 0; i < 3; i++) {
      if (deadline - Date.now() < (row.status === "profil" ? 80_000 : 30_000)) return result
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
        break
      }
      const { data: next } = await db.from("close_onboarding").select("lead_id, client_id, trigger_status, triggered_at, status, attempts").eq("lead_id", row.lead_id).single()
      // Weiter nur, wenn sich der Schritt geändert hat (sonst warten Aktivitäten noch).
      if (!next || next.status === row.status || next.status === "erledigt" || next.status === "fehler") break
      row = next as OnboardingRow
    }
  }
  return result
}
