// Close-Aktivitäten im Projekt des Kunden (Paket 17, T-54; erweitert in Paket 30, T-127).
//
// 1. Close meldet per Webhook neue/geänderte Aktivitäten eines Leads: Besprechungen
//    (Notetaker-Zusammenfassung), Telefonate (Aufnahme), Notizen, eigene Aktivitäten
//    (z.B. "Sales Call", Formularfelder) und Lead-Statuswechsel. Gehört der Lead zu einem
//    Kunden (clients.close_lead_id), wird die Aktivität in close_meeting_summaries
//    vorgemerkt (je Aktivität nur einmal). Der Cronjob fragt zusätzlich die letzten Tage ab.
// 2. Der Cronjob close-meetings (alle 5 Minuten) arbeitet die Warteschlange ab:
//    Besprechungen fasst die KI zusammen, Telefonate werden erst transkribiert (Workers AI)
//    und dann zusammengefasst, Notizen/eigene Aktivitäten/Statuswechsel werden lesbar
//    übernommen. Ergebnis: ein Kommentar im Projekt, datiert auf den Zeitpunkt in Close.
// Kommentare gibt es nur für Telefonate und Besprechungen ab dem Status "Gewonnen" - davor
// schaut das Team ohnehin in Close (Entscheidung 07.10.2026). Bei der Übernahme eines Kunden
// (close-onboarding.ts) wird der Verlauf trotzdem gelesen und Telefonate transkribiert, aber
// ohne Kommentar: nur als Grundlage für das KI-Kanzleiprofil (create_comment = false).
import { createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { summarizeCall } from "@/lib/call-summary"
import { closeLeadUrl } from "@/lib/close-webhook"
import { closeConfigured, closeGet, closeList, customActivityLabels, downloadCallRecording, type CloseActivity } from "@/lib/close-api"
import { transcribeAudio } from "@/lib/transcribe"

const MAX_ATTEMPTS = 3
const BATCH = 20
// Telefonate unter einer Minute ohne Notiz (nicht erreicht, Mailbox) werden nicht übernommen.
const MIN_CALL_SECONDS = 60

// Close signiert jede Webhook-Zustellung: HMAC-SHA256(signature_key als Hex, timestamp + body).
export function verifyCloseSignature(body: string, timestamp: string | null, hash: string | null, signatureKey: string | undefined): boolean {
  if (!timestamp || !hash || !signatureKey) return false
  const expected = createHmac("sha256", Buffer.from(signatureKey, "hex")).update(timestamp + body).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface CloseWebhookEvent {
  event?: { object_type?: string; action?: string; lead_id?: string; data?: CloseActivity | null }
}

// Laufende Übernahme erst ab Einrichtung der Anbindung (Webhook am 06.10.2026) - kein
// Altbestand für Bestandskunden (Entscheidung 06.10.2026).
export const CLOSE_MEETINGS_SINCE = "2026-10-06T08:00:00Z"

export type ActivityType = "meeting" | "call" | "note" | "custom" | "status"

const TYPE_BY_CLOSE: Record<string, ActivityType> = {
  Meeting: "meeting",
  Call: "call",
  Note: "note",
  CustomActivity: "custom",
  LeadStatusChange: "status",
}
const API_PATH: Record<ActivityType, string> = {
  meeting: "meeting",
  call: "call",
  note: "note",
  custom: "custom",
  status: "status_change/lead",
}
const TYPE_BY_OBJECT: Record<string, ActivityType> = {
  "activity.meeting": "meeting",
  "activity.call": "call",
  "activity.note": "note",
  "activity.custom_activity": "custom",
  "activity.lead_status_change": "status",
}

export function activityTypeOf(a: Pick<CloseActivity, "_type">): ActivityType | null {
  return TYPE_BY_CLOSE[a._type] ?? null
}

function activityDate(a: CloseActivity): string | null {
  return a.starts_at ?? a.activity_at ?? a.date_created ?? null
}

// Eigene Aktivität (Formular in Close) als Text: "Feld: Wert" je Zeile.
export function customActivityText(a: CloseActivity, fieldNames: Map<string, string>): string {
  const lines: string[] = []
  for (const [key, value] of Object.entries(a)) {
    if (!key.startsWith("custom.") || value === null || value === undefined || value === "") continue
    const name = fieldNames.get(key.slice("custom.".length)) ?? key.slice("custom.".length)
    const text = Array.isArray(value) ? value.join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value)
    lines.push(`${name}: ${text}`)
  }
  return lines.join("\n")
}

// Arten, die als Kommentar im Projekt landen.
const COMMENT_TYPES = new Set<ActivityType>(["call", "meeting"])

// Kunde in Close noch nicht gewonnen (nur Folgebesprechung) -> noch keine Kommentare.
export function closeStatusAllowsComments(closeStatus: string | null | undefined): boolean {
  return !/^folgebe/i.test((closeStatus ?? "").trim())
}

interface RecordOptions {
  // Verlauf bei der Übernahme eines neuen Kunden: alle Arten (außer Statuswechsel), auch vor
  // CLOSE_MEETINGS_SINCE; Kommentar nur für Telefonate/Besprechungen ab commentsFrom.
  includeHistory?: boolean
  commentsFrom?: string | null
  clientId?: string
  // Laufend: darf der Kunde schon Kommentare bekommen (Status "Gewonnen")?
  clientWon?: boolean
  labels?: { types: Map<string, string>; fields: Map<string, string> }
}

// Merkt eine Aktivität vor. Liefert, was passiert ist.
export async function recordActivity(db: SupabaseClient, a: CloseActivity, opts: RecordOptions = {}): Promise<string> {
  const type = activityTypeOf(a)
  if (!type) return "Art wird nicht übernommen"
  if (!a.id || !a.lead_id) return "ohne ID"
  const at = activityDate(a)
  if (!opts.includeHistory && at && at < CLOSE_MEETINGS_SINCE) return "vor Start der Anbindung"
  // Laufend nur Telefonate und Besprechungen; im Verlauf alles außer Statuswechseln.
  if (opts.includeHistory ? type === "status" : !COMMENT_TYPES.has(type)) return "Art wird nicht übernommen"

  let raw: string | null = null
  let title: string | null = a.title ?? null
  if (type === "meeting") {
    raw = a.summary?.text?.trim() || null
    if (!raw) return "ohne Zusammenfassung"
  } else if (type === "call") {
    const longEnough = (a.duration ?? 0) >= MIN_CALL_SECONDS && !!a.has_recording && !!a.recording_url
    raw = a.note?.trim() || null
    if (!longEnough && !raw) return "kurzes Telefonat ohne Notiz"
    title = `Telefonat (${a.direction === "inbound" ? "eingehend" : "ausgehend"})`
  } else if (type === "note") {
    raw = a.note?.trim() || null
    if (!raw) return "leere Notiz"
  } else if (type === "custom") {
    const labels = opts.labels ?? (await customActivityLabels())
    raw = customActivityText(a, labels.fields) || null
    title = labels.types.get(a.custom_activity_type_id ?? "") ?? "Aktivität"
    if (!raw) return "leere Aktivität"
  } else {
    if (!a.new_status_label) return "ohne Status"
    raw = `${a.old_status_label ?? "–"} → ${a.new_status_label}`
  }

  let clientId = opts.clientId ?? null
  let clientWon = opts.clientWon ?? true
  if (!clientId) {
    const { data: client } = await db.from("clients").select("id, close_status").eq("close_lead_id", a.lead_id).maybeSingle()
    if (!client) return "Lead gehört zu keinem Kunden"
    clientId = client.id as string
    clientWon = closeStatusAllowsComments(client.close_status as string | null)
  }
  const createComment = opts.includeHistory
    ? COMMENT_TYPES.has(type) && !!opts.commentsFrom && !!at && at >= opts.commentsFrom
    : clientWon

  const attendees = (a.attendees ?? []).map((x) => x.name || x.email).filter(Boolean).join(", ")
  const { error } = await db.from("close_meeting_summaries").upsert(
    {
      close_activity_id: a.id,
      lead_id: a.lead_id,
      client_id: clientId,
      activity_type: type,
      activity_at: at,
      title,
      starts_at: a.starts_at ?? null,
      user_name: a.user_name ?? a.created_by_name ?? null,
      attendees: attendees || null,
      raw_summary: raw,
      call_duration: type === "call" ? (a.duration ?? null) : null,
      create_comment: createComment,
    },
    { onConflict: "close_activity_id", ignoreDuplicates: true }
  )
  if (error) throw new Error(error.message)
  return "vorgemerkt"
}

// Webhook: Aktivität frisch über die API lesen (die Ereignisse enthalten z.B. die
// Notetaker-Zusammenfassung nicht) und vormerken.
export async function recordActivityFromWebhook(db: SupabaseClient, payload: CloseWebhookEvent): Promise<string> {
  const ev = payload.event
  const type = TYPE_BY_OBJECT[ev?.object_type ?? ""]
  if (!type) return "Art wird nicht übernommen"
  const id = ev?.data?.id
  if (!id) return "ohne ID"
  const fresh = await closeGet<CloseActivity>(`/activity/${API_PATH[type]}/${id}/`)
  return recordActivity(db, fresh ?? ev?.data ?? ({} as CloseActivity))
}

// Kompletter Verlauf eines Leads (Übernahme eines neuen Kunden). Kommentare nur für
// Telefonate/Besprechungen ab commentsFrom (Zeitpunkt "Gewonnen"). Liefert die Anzahl.
export async function importLeadHistory(db: SupabaseClient, leadId: string, clientId: string, commentsFrom: string | null): Promise<number> {
  const [activities, labels] = await Promise.all([closeList<CloseActivity>(`/activity/?lead_id=${encodeURIComponent(leadId)}`, 1000), customActivityLabels()])
  let found = 0
  for (const a of activities) {
    if ((await recordActivity(db, a, { includeHistory: true, commentsFrom, clientId, labels })) === "vorgemerkt") found++
  }
  return found
}

// Absicherung im Cronjob, falls ein Webhook ausbleibt (z.B. kein Ereignis, wenn der
// Notetaker fertig wird). Je Art über den eigenen Endpunkt: Close hat ca. 800 Telefonate am
// Tag (Kaltakquise) - deshalb nur die letzten 2 Stunden; Besprechungen 3 Tage, weil die
// Zusammenfassung oft erst später dazukommt (geändert statt angelegt).
const POLL: { path: string; filter: string; hours: number }[] = [
  { path: "meeting", filter: "date_updated__gte", hours: 72 },
  { path: "call", filter: "date_created__gte", hours: 2 },
]

export async function pollRecentActivities(db: SupabaseClient): Promise<number> {
  if (!closeConfigured()) return 0
  const { data: clients } = await db.from("clients").select("id, close_lead_id, close_status").not("close_lead_id", "is", null)
  const clientByLead = new Map((clients ?? []).map((c) => [c.close_lead_id as string, c.id as string]))
  const wonByLead = new Map((clients ?? []).map((c) => [c.close_lead_id as string, closeStatusAllowsComments(c.close_status as string | null)]))
  if (clientByLead.size === 0) return 0
  const lists = await Promise.all(
    POLL.map((p) => {
      const since = new Date(Date.now() - p.hours * 3600e3).toISOString()
      return closeList<CloseActivity>(`/activity/${p.path}/?${p.filter}=${encodeURIComponent(since)}`, 1000)
    })
  )
  const relevant = lists.flat().filter((a) => a.lead_id && clientByLead.has(a.lead_id) && activityTypeOf(a))
  if (relevant.length === 0) return 0
  const { data: known } = await db
    .from("close_meeting_summaries")
    .select("close_activity_id")
    .in("close_activity_id", relevant.map((a) => a.id).slice(0, 500))
  const knownIds = new Set((known ?? []).map((k) => k.close_activity_id as string))
  const fresh = relevant.filter((a) => !knownIds.has(a.id))
  let found = 0
  for (const a of fresh) {
    if ((await recordActivity(db, a, { clientId: clientByLead.get(a.lead_id!), clientWon: wonByLead.get(a.lead_id!) })) === "vorgemerkt") found++
  }
  return found
}

function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }) : null
}

export interface CloseActivitiesResult {
  processed: number
  failed: number
}

interface QueueRow {
  close_activity_id: string
  lead_id: string
  client_id: string
  activity_type: ActivityType
  activity_at: string | null
  title: string | null
  starts_at: string | null
  user_name: string | null
  attendees: string | null
  raw_summary: string | null
  transcript: string | null
  call_duration: number | null
  create_comment: boolean
  attempts: number
  clients: { name: string } | { name: string }[] | null
}

const KIND: Record<ActivityType, string> = { meeting: "gespraech", call: "telefonat", note: "notiz", custom: "notiz", status: "system" }

// Aufnahme eines Telefonats holen und transkribieren (Transkript gespeichert, damit ein
// zweiter Versuch nicht erneut transkribiert). null ohne Aufnahme.
async function transcribeCall(db: SupabaseClient, row: QueueRow, clientName: string): Promise<string | null> {
  if ((row.call_duration ?? 0) < MIN_CALL_SECONDS) return null
  const call = await closeGet<CloseActivity>(`/activity/call/${row.close_activity_id}/`)
  if (!call?.recording_url || !call.has_recording) return null
  const transcript = await transcribeAudio(await downloadCallRecording(call.recording_url), `Telefonat mit der Steuerkanzlei ${clientName}.`)
  await db.from("close_meeting_summaries").update({ transcript }).eq("close_activity_id", row.close_activity_id)
  return transcript
}

// Text des Kommentars je Art.
async function commentContent(db: SupabaseClient, row: QueueRow, clientName: string): Promise<string> {
  const date = formatDate(row.activity_at ?? row.starts_at)
  const link = `\n\nIn Close ansehen: ${closeLeadUrl(row.lead_id)}`
  if (row.activity_type === "status") return `Status in Close: ${row.raw_summary}`
  if (row.activity_type === "note") return `${["Notiz aus Close", row.user_name, date].filter(Boolean).join(" · ")}\n\n${row.raw_summary}${link}`
  if (row.activity_type === "custom") return `${[row.title ?? "Aktivität", row.user_name, date].filter(Boolean).join(" · ")}\n\n${row.raw_summary}${link}`

  let source = row.raw_summary ?? ""
  if (row.activity_type === "call") {
    const transcript = row.transcript ?? (await transcribeCall(db, row, clientName))
    if (!transcript) return `${["Telefonat", row.user_name, date].filter(Boolean).join(" · ")}\n\n${row.raw_summary ?? "Ohne Aufnahme."}${link}`
    source = transcript
  }

  const summary = await summarizeCall({
    clientName,
    transcript: source,
    closeNote: row.activity_type === "call" ? row.raw_summary : null,
    title: row.title,
    attendees: row.attendees,
    userName: row.user_name,
    durationSeconds: row.call_duration,
    date,
  })
  const minutes = row.call_duration ? ` · ${Math.round(row.call_duration / 60)} Min.` : ""
  const header = [row.title || "Gespräch", date].filter(Boolean).join(" · ") + minutes
  return `${header}\n\n${summary}${link}`
}

// Arbeitet die Warteschlange ab, bis deadline (ms seit Epoch) erreicht ist. Telefonate mit
// Transkription brauchen 1-3 Minuten; ein neues wird nur begonnen, wenn genug Zeit bleibt.
export async function processPendingActivities(db: SupabaseClient, deadline: number): Promise<CloseActivitiesResult> {
  // Hängengebliebene Sperren (Lauf abgebrochen) wieder freigeben.
  await db
    .from("close_meeting_summaries")
    .update({ status: "offen", locked_at: null })
    .eq("status", "in_arbeit")
    .lt("locked_at", new Date(Date.now() - 20 * 60e3).toISOString())

  const { data, error } = await db
    .from("close_meeting_summaries")
    .select("close_activity_id, lead_id, client_id, activity_type, activity_at, title, starts_at, user_name, attendees, raw_summary, transcript, call_duration, create_comment, attempts, clients(name)")
    .eq("status", "offen")
    .order("activity_at", { ascending: true, nullsFirst: true })
    .limit(BATCH)
  if (error) throw new Error(error.message)

  const result: CloseActivitiesResult = { processed: 0, failed: 0 }
  for (const row of (data ?? []) as unknown as QueueRow[]) {
    const needsTranscript = row.activity_type === "call" && !row.transcript && (row.call_duration ?? 0) >= MIN_CALL_SECONDS
    const remaining = deadline - Date.now()
    if (remaining < (needsTranscript ? 200_000 : 40_000)) break
    const rel = row.clients
    const clientName = (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "Kanzlei"
    // Sperren - ein paralleler Lauf hat sie evtl. schon übernommen.
    const { data: claimed } = await db
      .from("close_meeting_summaries")
      .update({ status: "in_arbeit", locked_at: new Date().toISOString() })
      .eq("close_activity_id", row.close_activity_id)
      .eq("status", "offen")
      .select("close_activity_id")
    if (!claimed?.length) continue
    try {
      if (!row.create_comment) {
        // Nur Grundlage für das KI-Profil: Telefonat transkribieren, kein Kommentar.
        if (needsTranscript) await transcribeCall(db, row, clientName)
        await db
          .from("close_meeting_summaries")
          .update({ status: "erledigt", processed_at: new Date().toISOString(), error: null, locked_at: null })
          .eq("close_activity_id", row.close_activity_id)
        result.processed++
        continue
      }
      const content = await commentContent(db, row, clientName)
      // Kommentar dem Bearbeiter in Close zuordnen, wenn er ein Team-Profil hat.
      const { data: author } = row.user_name
        ? await db.from("profiles").select("id").ilike("full_name", row.user_name).in("role", ["agency_admin", "agency_member"]).limit(1).maybeSingle()
        : { data: null }
      const { data: comment, error: commentError } = await db
        .from("client_comments")
        .insert({
          client_id: row.client_id,
          author_id: author?.id ?? null,
          kind: KIND[row.activity_type],
          content,
          // Chronologisch wie in Close einsortieren.
          ...(row.activity_at ? { created_at: row.activity_at } : {}),
        })
        .select("id")
        .single()
      if (commentError) throw new Error(commentError.message)
      await db
        .from("close_meeting_summaries")
        .update({ status: "erledigt", comment_id: comment.id, processed_at: new Date().toISOString(), error: null, locked_at: null })
        .eq("close_activity_id", row.close_activity_id)
      result.processed++
    } catch (err) {
      const attempts = row.attempts + 1
      await db
        .from("close_meeting_summaries")
        .update({ attempts, status: attempts >= MAX_ATTEMPTS ? "fehler" : "offen", locked_at: null, error: err instanceof Error ? err.message : String(err) })
        .eq("close_activity_id", row.close_activity_id)
      result.failed++
    }
  }
  return result
}

// Texte aller verarbeiteten Aktivitäten eines Leads (Grundlage für das Kanzleiprofil).
export async function leadActivityTexts(db: SupabaseClient, leadId: string): Promise<{ type: ActivityType; title: string | null; at: string | null; text: string }[]> {
  const { data } = await db
    .from("close_meeting_summaries")
    .select("activity_type, title, activity_at, raw_summary, transcript")
    .eq("lead_id", leadId)
    .neq("activity_type", "status")
    .order("activity_at", { ascending: true })
  return (data ?? [])
    .map((r) => ({
      type: r.activity_type as ActivityType,
      title: r.title as string | null,
      at: r.activity_at as string | null,
      text: ((r.transcript as string | null) ?? (r.raw_summary as string | null) ?? "").trim(),
    }))
    .filter((r) => r.text)
}
