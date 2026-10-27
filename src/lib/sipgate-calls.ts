// Anrufe mit Kandidaten über sipgate (Paket 92): Push-Ereignisse (newCall, answer, hangup)
// einem Kandidaten zuordnen und nach dem Auflegen in den Verlauf schreiben. Erfasst werden
// auch Anrufe, die nicht über Kandidatenwerk gestartet wurden - erkannt an der Nummer.
// Läuft mit dem Service-Role-Client (candidate_calls hat keine Policies).
import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizePhone } from "@/lib/phone"

type Db = SupabaseClient

export interface PushEvent {
  event: string
  callId: string
  direction: "in" | "out"
  from: string
  to: string
  cause: string | null
  sipgateUserIds: string[]
}

export function parsePushEvent(form: FormData): PushEvent | null {
  const event = String(form.get("event") ?? "")
  const callId = String(form.get("callId") ?? "")
  if (!event || !callId) return null
  return {
    event,
    callId,
    direction: form.get("direction") === "in" ? "in" : "out",
    from: String(form.get("from") ?? ""),
    to: String(form.get("to") ?? ""),
    cause: form.get("cause") ? String(form.get("cause")) : null,
    sipgateUserIds: [...form.getAll("userId[]"), ...form.getAll("userId")].map(String).filter(Boolean),
  }
}

const CAUSES: Record<string, string> = {
  busy: "besetzt",
  noAnswer: "keine Antwort",
  cancel: "abgebrochen",
  congestion: "Leitung überlastet",
  notFound: "Nummer nicht erreichbar",
  forwarded: "weitergeleitet",
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")} Min`
}

// Text für den Verlauf, z. B. "Ausgehender Anruf · Christina Hohler · 6:12 Min · erreicht".
export function callHistoryText(c: { direction: string; userName: string | null; answered: boolean; durationSeconds: number; cause: string | null }): string {
  const parts = [c.direction === "in" ? "Eingehender Anruf" : "Ausgehender Anruf"]
  if (c.userName) parts.push(c.userName)
  if (c.answered) {
    parts.push(formatDuration(c.durationSeconds), "erreicht")
  } else {
    const reason = c.cause && CAUSES[c.cause]
    parts.push(reason ? `nicht erreicht (${reason})` : "nicht erreicht")
  }
  return parts.join(" · ")
}

// Antwort auf newCall: answer und hangup an dieselbe Adresse melden lassen.
export function pushSubscribeXml(url: string): string {
  const esc = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Response onAnswer="${esc}" onHangup="${esc}" />`
}

const PENDING_WINDOW_MS = 3 * 60_000

// newCall: über Kandidatenwerk gestarteten Anruf oder Kandidaten über die Nummer finden.
// Liefert true, wenn der Anruf zu einem Kandidaten gehört (dann answer/hangup abonnieren).
export async function handleNewCall(db: Db, e: PushEvent, now = new Date()): Promise<boolean> {
  const number = normalizePhone(e.direction === "out" ? e.to : e.from)
  if (!number) return false
  const { data: existing } = await db.from("candidate_calls").select("id").eq("sipgate_call_id", e.callId).maybeSingle()
  if (existing) return true

  if (e.direction === "out") {
    const { data: pending } = await db
      .from("candidate_calls")
      .select("id")
      .is("sipgate_call_id", null)
      .eq("direction", "out")
      .eq("number", number)
      .gte("started_at", new Date(now.getTime() - PENDING_WINDOW_MS).toISOString())
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (pending) {
      await db.from("candidate_calls").update({ sipgate_call_id: e.callId, status: "klingelt" }).eq("id", pending.id)
      return true
    }
  }

  const { data: candidate } = await db
    .from("candidates")
    .select("id")
    .eq("phone_normalized", number)
    .eq("is_demo", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!candidate) return false
  const { data: profile } = e.sipgateUserIds.length
    ? await db.from("profiles").select("id").in("sipgate_user_id", e.sipgateUserIds).limit(1).maybeSingle()
    : { data: null }
  const { error } = await db.from("candidate_calls").insert({
    candidate_id: candidate.id,
    user_id: profile?.id ?? null,
    direction: e.direction,
    number,
    sipgate_call_id: e.callId,
    status: "klingelt",
    started_at: now.toISOString(),
  })
  // Doppelt gemeldet (gleiche callId): gilt als bekannt.
  return !error || error.code === "23505"
}

export async function handleAnswer(db: Db, e: PushEvent, now = new Date()): Promise<void> {
  await db.from("candidate_calls").update({ answered_at: now.toISOString(), status: "verbunden" }).eq("sipgate_call_id", e.callId).is("answered_at", null)
}

export async function handleHangup(db: Db, e: PushEvent, now = new Date()): Promise<void> {
  const { data: call } = await db
    .from("candidate_calls")
    .select("id, candidate_id, user_id, direction, answered_at, status")
    .eq("sipgate_call_id", e.callId)
    .maybeSingle()
  if (!call || call.status === "beendet") return
  const answered = !!call.answered_at
  const durationSeconds = answered ? Math.max(0, Math.round((now.getTime() - Date.parse(call.answered_at)) / 1000)) : 0
  await db
    .from("candidate_calls")
    .update({ ended_at: now.toISOString(), cause: e.cause, status: "beendet", duration_seconds: durationSeconds })
    .eq("id", call.id)
  if (!call.candidate_id) return
  const { data: user } = call.user_id ? await db.from("profiles").select("full_name").eq("id", call.user_id).maybeSingle() : { data: null }
  await db.from("candidate_history").insert({
    candidate_id: call.candidate_id,
    type: "call",
    content: callHistoryText({ direction: call.direction, userName: user?.full_name ?? null, answered, durationSeconds, cause: e.cause }),
    ...(call.user_id ? { created_by: call.user_id } : {}),
  })
}
