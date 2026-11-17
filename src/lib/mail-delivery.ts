// Zustellprüfung für Mails (Paket 106, Fehlermeldung vom 05.11.2026): Brevo nimmt eine Mail
// an, der Mailserver des Empfängers kann sie trotzdem abweisen - z. B. am 02.11., als
// Brevos Versandserver auf einer Spam-Sperrliste stand und die Kanzlei "Neuer Kandidat für
// Sie" nie bekam. Stündlich holt dieser Job die abgewiesenen Mails bei Brevo ab:
// - vorübergehend abgewiesen (softBounces): einmal erneut verschicken, frühestens nach
//   RETRY_AFTER_MINUTES, mit gleichem Inhalt, Betreff, Absendernamen und Antwortadresse;
// - endgültig abgewiesen (hardBounces, blocked) oder auch der zweite Versuch scheitert:
//   melden - beim Kandidaten im Verlauf, sonst (Kanzlei, Team) bei den Fehlermeldungen.
// Berücksichtigt nur Mails aus dem eigenen Versandprotokoll (mail_versand), nicht andere
// Absender desselben Brevo-Kontos.

import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@/lib/brevo-mail"
import { recordSystemReport } from "@/lib/bug-reports/system-reports"

export const RETRY_AFTER_MINUTES = 30
const RETENTION_DAYS = 30
const BREVO_API = "https://api.brevo.com/v3"

export type DeliveryEventName = "softBounces" | "hardBounces" | "blocked"
const EVENT_NAMES: DeliveryEventName[] = ["softBounces", "hardBounces", "blocked"]

export interface DeliveryEvent {
  messageId: string
  email: string
  event: DeliveryEventName
  reason: string
  date: string
}

export interface SentMail {
  message_id: string
  subject: string
  sender_name: string | null
  reply_to: { email: string; name?: string } | null
  retry_of: string | null
}

export interface MailDeliveryResult {
  events: number
  retried: number
  reported: number
  errors: string[]
}

const problemKey = (e: { messageId: string; email: string; event: string }) => `${e.messageId}|${e.email.toLowerCase()}|${e.event}`

// Entscheidung je Ereignis (reine Funktion, getestet): erneut verschicken, melden oder
// (noch) nichts tun.
export function planDelivery(
  events: DeliveryEvent[],
  sent: Map<string, Pick<SentMail, "retry_of">>,
  handled: Set<string>,
  now: Date
): { retry: DeliveryEvent[]; report: DeliveryEvent[] } {
  const retry: DeliveryEvent[] = []
  const report: DeliveryEvent[] = []
  const seen = new Set<string>()
  for (const e of events) {
    const key = problemKey(e)
    if (!sent.has(e.messageId) || handled.has(key) || seen.has(key)) continue
    seen.add(key)
    const isRetry = Boolean(sent.get(e.messageId)?.retry_of)
    if (e.event === "softBounces" && !isRetry) {
      const ageMinutes = (now.getTime() - new Date(e.date).getTime()) / 60_000
      if (ageMinutes >= RETRY_AFTER_MINUTES) retry.push(e)
      continue
    }
    report.push(e)
  }
  return { retry, report }
}

export function describeReason(e: Pick<DeliveryEvent, "event" | "reason">): string {
  const reason = e.reason.replace(/\s+/g, " ").trim().slice(0, 200)
  if (e.event === "blocked") return "Adresse ist bei Brevo gesperrt (frühere Abweisung oder Abmeldung)"
  if (e.event === "hardBounces") return `Adresse existiert nicht oder nimmt keine Mails an${reason ? ` (${reason})` : ""}`
  return `vom Mailserver abgewiesen${reason ? ` (${reason})` : ""}`
}

async function brevoGet<T>(path: string): Promise<T> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error("BREVO_API_KEY ist nicht gesetzt.")
  const response = await fetch(`${BREVO_API}${path}`, { headers: { "api-key": apiKey, accept: "application/json" } })
  if (!response.ok) throw new Error(`Brevo ${response.status} bei ${path.split("?")[0]}: ${(await response.text().catch(() => "")).slice(0, 200)}`)
  return response.json() as Promise<T>
}

async function fetchEvents(now: Date): Promise<DeliveryEvent[]> {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  const startDate = day(new Date(now.getTime() - 24 * 3600 * 1000))
  const endDate = day(now)
  const all: DeliveryEvent[] = []
  for (const event of EVENT_NAMES) {
    const data = await brevoGet<{ events?: { messageId?: string; email?: string; event?: string; reason?: string; date?: string }[] }>(
      `/smtp/statistics/events?event=${event}&startDate=${startDate}&endDate=${endDate}&limit=2500`
    )
    for (const e of data.events ?? []) {
      if (!e.messageId || !e.email || !e.date) continue
      all.push({ messageId: e.messageId, email: e.email.toLowerCase(), event, reason: e.reason ?? "", date: e.date })
    }
  }
  return all
}

// Inhalt der abgewiesenen Mail bei Brevo holen und an diese eine Adresse erneut schicken.
async function resend(e: DeliveryEvent, mail: SentMail): Promise<void> {
  const list = await brevoGet<{ transactionalEmails?: { email: string; uuid: string }[] }>(
    `/smtp/emails?messageId=${encodeURIComponent(e.messageId)}`
  )
  const entries = list.transactionalEmails ?? []
  const entry = entries.find((t) => t.email.toLowerCase() === e.email) ?? entries[0]
  if (!entry) throw new Error("Mail bei Brevo nicht gefunden")
  const content = await brevoGet<{ body?: string }>(`/smtp/emails/${entry.uuid}`)
  if (!content.body) throw new Error("Inhalt der Mail bei Brevo nicht verfügbar")
  const subject = mail.subject.replace(/^\[Staging\] /, "")
  const delivered = await sendEmail([e.email], subject, content.body, {
    senderName: mail.sender_name ?? undefined,
    replyTo: mail.reply_to ?? undefined,
    retryOf: e.messageId,
  })
  if (delivered.length === 0) throw new Error("Adresse vom Versand ausgeschlossen")
}

async function report(db: SupabaseClient, e: DeliveryEvent, mail: SentMail): Promise<void> {
  const when = new Date(e.date).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
  const retried = mail.retry_of ? " Kandidatenwerk hatte sie schon einmal erneut verschickt." : ""
  const subject = mail.subject.replace(/^\[Staging\] /, "")

  // Kandidat: Hinweis im Verlauf, dort sieht das Team ihn bei der Arbeit am Kandidaten.
  const { data: candidates } = await db.from("candidates").select("id").ilike("email", e.email.replace(/[\\%_]/g, "\\$&")).limit(5)
  if (candidates && candidates.length > 0) {
    const content = `E-Mail „${subject}“ an ${e.email} nicht zugestellt: ${describeReason(e)}.${retried}`
    const { error } = await db.from("candidate_history").insert(candidates.map((c) => ({ candidate_id: c.id, type: "email", content })))
    if (error) throw new Error(error.message)
    return
  }

  // Kanzlei, Portal-Zugang oder Team: bei den Fehlermeldungen.
  await recordSystemReport(db, {
    sourceKey: `mail:${e.email}`,
    title: `Mail an ${e.email} nicht zugestellt`,
    description: `Betreff: ${subject}\nVerschickt: ${when}\nGrund: ${describeReason(e)}.${retried}\n\nBitte die Adresse prüfen und den Empfänger bei Bedarf anders informieren.`,
  })
}

export async function checkMailDelivery(db: SupabaseClient, now = new Date()): Promise<MailDeliveryResult> {
  const result: MailDeliveryResult = { events: 0, retried: 0, reported: 0, errors: [] }

  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 3600 * 1000).toISOString()
  await db.from("mail_versand").delete().lt("created_at", cutoff)
  await db.from("mail_zustellprobleme").delete().lt("created_at", cutoff)

  const events = await fetchEvents(now)
  result.events = events.length
  if (events.length === 0) return result

  const ids = [...new Set(events.map((e) => e.messageId))]
  const sent = new Map<string, SentMail>()
  const handled = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const [{ data: mails, error: mailError }, { data: problems, error: problemError }] = await Promise.all([
      db.from("mail_versand").select("message_id, subject, sender_name, reply_to, retry_of").in("message_id", chunk),
      db.from("mail_zustellprobleme").select("message_id, email, event").in("message_id", chunk),
    ])
    if (mailError) throw new Error(mailError.message)
    if (problemError) throw new Error(problemError.message)
    for (const m of (mails ?? []) as SentMail[]) sent.set(m.message_id, m)
    for (const p of problems ?? []) handled.add(problemKey({ messageId: p.message_id as string, email: p.email as string, event: p.event as string }))
  }

  const plan = planDelivery(events, sent, handled, now)

  for (const [e, handling] of [...plan.retry.map((x) => [x, "erneut_gesendet"] as const), ...plan.report.map((x) => [x, "gemeldet"] as const)]) {
    const mail = sent.get(e.messageId)!
    // Erst vermerken, dann handeln: läuft der Job doppelt, handelt nur einer (UNIQUE).
    const { error: claimError } = await db
      .from("mail_zustellprobleme")
      .insert({ message_id: e.messageId, email: e.email, event: e.event, reason: e.reason.slice(0, 500), occurred_at: e.date, handling })
    if (claimError) {
      if (claimError.code !== "23505") result.errors.push(`Vermerk ${e.email}: ${claimError.message}`)
      continue
    }
    try {
      if (handling === "erneut_gesendet") {
        await resend(e, mail)
        result.retried++
      } else {
        await report(db, e, mail)
        result.reported++
      }
    } catch (err) {
      // Vermerk zurücknehmen, damit der nächste Lauf es erneut versucht.
      await db.from("mail_zustellprobleme").delete().eq("message_id", e.messageId).eq("email", e.email).eq("event", e.event)
      result.errors.push(`${handling === "erneut_gesendet" ? "Erneuter Versand" : "Meldung"} an ${e.email}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return result
}
