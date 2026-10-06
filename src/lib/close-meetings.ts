// Gespräche aus Close beim Kunden (Paket 17, T-54).
//
// 1. Close schickt per Webhook jede neue/geänderte Besprechung (activity.meeting). Hat sie
//    eine Notetaker-Zusammenfassung und gehört der Lead zu einem Kunden, wird sie in
//    close_meeting_summaries vorgemerkt (je Besprechung nur einmal).
// 2. Der Cronjob close-meetings (alle 5 Minuten) lässt Claude daraus eine knappe
//    Zusammenfassung schreiben und legt sie als Kommentar "Gespräch" im Projekt an.
// Reine Telefonanrufe haben in Close nur eine Audio-Aufnahme ohne Text - die werden nicht
// übernommen. Nur neue Gespräche, kein Altbestand (Entscheidung 06.10.2026).
import { createHmac, timingSafeEqual } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { summarizeCall } from "@/lib/call-summary"
import { closeLeadUrl } from "@/lib/close-webhook"

const MAX_ATTEMPTS = 3
const BATCH = 5

// Close signiert jede Webhook-Zustellung: HMAC-SHA256(signature_key als Hex, timestamp + body).
export function verifyCloseSignature(body: string, timestamp: string | null, hash: string | null, signatureKey: string | undefined): boolean {
  if (!timestamp || !hash || !signatureKey) return false
  const expected = createHmac("sha256", Buffer.from(signatureKey, "hex")).update(timestamp + body).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface CloseMeeting {
  id?: string
  lead_id?: string
  title?: string | null
  starts_at?: string | null
  user_name?: string | null
  attendees?: { name?: string | null; email?: string | null }[] | null
  summary?: { text?: string | null } | null
}

export interface CloseWebhookEvent {
  event?: { object_type?: string; action?: string; data?: CloseMeeting | null }
}

// Merkt eine Besprechung mit Notetaker-Zusammenfassung vor. Liefert, was passiert ist.
export async function recordMeetingFromWebhook(db: SupabaseClient, payload: CloseWebhookEvent): Promise<string> {
  const ev = payload.event
  if (ev?.object_type !== "activity.meeting") return "kein Meeting"
  const m = ev.data
  const summary = m?.summary?.text?.trim()
  if (!m?.id || !m.lead_id || !summary) return "ohne Zusammenfassung"

  const { data: client } = await db.from("clients").select("id").eq("close_lead_id", m.lead_id).maybeSingle()
  if (!client) return "Lead gehört zu keinem Kunden"

  const attendees = (m.attendees ?? []).map((a) => a.name || a.email).filter(Boolean).join(", ")
  const { error } = await db.from("close_meeting_summaries").upsert(
    {
      close_activity_id: m.id,
      lead_id: m.lead_id,
      client_id: client.id,
      title: m.title ?? null,
      starts_at: m.starts_at ?? null,
      user_name: m.user_name ?? null,
      attendees: attendees || null,
      raw_summary: summary,
    },
    { onConflict: "close_activity_id", ignoreDuplicates: true }
  )
  if (error) throw new Error(error.message)
  return "vorgemerkt"
}

function formatDate(iso: string | null): string | null {
  return iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" }) : null
}

export interface CloseMeetingsResult {
  processed: number
  failed: number
}

export async function processPendingMeetings(db: SupabaseClient): Promise<CloseMeetingsResult> {
  const { data: rows, error } = await db
    .from("close_meeting_summaries")
    .select("close_activity_id, lead_id, client_id, title, starts_at, user_name, attendees, raw_summary, attempts, clients(name)")
    .eq("status", "offen")
    .order("created_at")
    .limit(BATCH)
  if (error) throw new Error(error.message)

  const result: CloseMeetingsResult = { processed: 0, failed: 0 }
  for (const row of rows ?? []) {
    const rel = row.clients as { name: string } | { name: string }[] | null
    const clientName = (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "Kanzlei"
    try {
      const summary = await summarizeCall({
        clientName,
        transcript: row.raw_summary,
        title: row.title,
        attendees: row.attendees,
        userName: row.user_name,
        date: formatDate(row.starts_at),
      })
      // Kommentar dem Gesprächsführer zuordnen, wenn er ein Team-Profil hat.
      const { data: author } = row.user_name
        ? await db.from("profiles").select("id").ilike("full_name", row.user_name).in("role", ["agency_admin", "agency_member"]).limit(1).maybeSingle()
        : { data: null }
      const header = [row.title || "Gespräch", formatDate(row.starts_at)].filter(Boolean).join(" · ")
      const content = `${header}\n\n${summary}\n\nIn Close ansehen: ${closeLeadUrl(row.lead_id)}`
      const { data: comment, error: commentError } = await db
        .from("client_comments")
        .insert({ client_id: row.client_id, author_id: author?.id ?? null, kind: "gespraech", content })
        .select("id")
        .single()
      if (commentError) throw new Error(commentError.message)
      await db
        .from("close_meeting_summaries")
        .update({ status: "erledigt", comment_id: comment.id, processed_at: new Date().toISOString(), error: null })
        .eq("close_activity_id", row.close_activity_id)
      result.processed++
    } catch (err) {
      const attempts = (row.attempts as number) + 1
      await db
        .from("close_meeting_summaries")
        .update({ attempts, status: attempts >= MAX_ATTEMPTS ? "fehler" : "offen", error: err instanceof Error ? err.message : String(err) })
        .eq("close_activity_id", row.close_activity_id)
      result.failed++
    }
  }
  return result
}
