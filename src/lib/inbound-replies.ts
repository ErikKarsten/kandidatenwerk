// Antworten von Kandidaten im Kandidatenwerk (Paket 19, T-89).
//
// Mails aus dem Reiter "Kommunikation" bekommen als Antwortadresse
// k-<Nachrichten-ID>@<INBOUND_REPLY_DOMAIN>. Die Subdomain zeigt per MX auf Brevo, Brevo
// schickt jede eingehende Mail als JSON an /api/webhooks/brevo-inbound. Die Antwort wird
// dem Kandidaten zugeordnet (über die Adresse, sonst über die Absender-Mail), im Reiter
// "Kommunikation" und im Verlauf gezeigt, und der Mitarbeiter bekommt eine Kopie.
// Ohne INBOUND_REPLY_DOMAIN gehen Antworten wie bisher direkt an den Mitarbeiter.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

export function replyAddressFor(messageId: string): string | null {
  const domain = process.env.INBOUND_REPLY_DOMAIN?.trim()
  return domain ? `k-${messageId}@${domain}` : null
}

// Nachrichten-ID aus einer Antwortadresse k-<uuid>@...
export function messageIdFromAddress(address: string | null | undefined): string | null {
  const m = (address ?? "").toLowerCase().match(/^k-([0-9a-f-]{36})@/)
  return m ? m[1] : null
}

interface Mailbox {
  Address?: string | null
  Name?: string | null
}

export interface InboundItem {
  MessageId?: string | null
  From?: Mailbox | null
  To?: Mailbox[] | null
  Recipients?: string[] | null
  Subject?: string | null
  RawTextBody?: string | null
  ExtractedMarkdownMessage?: string | null
  SentAtDate?: string | null
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export async function processInboundItem(db: SupabaseClient<Database>, item: InboundItem): Promise<string> {
  const from = item.From?.Address?.trim().toLowerCase() ?? null
  const recipients = [...(item.To ?? []).map((t) => t.Address ?? ""), ...(item.Recipients ?? [])]
  const messageId = recipients.map(messageIdFromAddress).find(Boolean) ?? null

  // 1. Über die Antwortadresse, 2. sonst über die Absender-Adresse des Kandidaten.
  let original: { id: string; candidate_id: string; sent_by: string | null; subject: string | null } | null = null
  if (messageId) {
    const { data } = await db.from("candidate_messages").select("id, candidate_id, sent_by, subject").eq("id", messageId).maybeSingle()
    original = data
  }
  if (!original && from) {
    const { data } = await db
      .from("candidate_messages")
      .select("id, candidate_id, sent_by, subject")
      .eq("direction", "ausgehend")
      .ilike("to_address", from)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    original = data
  }
  if (!original) return "keine Zuordnung"

  const body = (item.ExtractedMarkdownMessage || item.RawTextBody || "").trim() || "(leere Nachricht)"
  const subject = item.Subject?.trim() || (original.subject ? `Re: ${original.subject}` : "Antwort")
  const { error } = await db.from("candidate_messages").insert({
    candidate_id: original.candidate_id,
    channel: "email",
    direction: "eingehend",
    from_address: from,
    to_address: recipients[0] || "",
    subject,
    body,
    sent_by: original.sent_by,
    status: "gesendet",
    external_id: item.MessageId ?? null,
  })
  if (error) {
    if (error.code === "23505") return "bereits verarbeitet"
    throw new Error(error.message)
  }

  const [{ data: candidate }, { data: employee }] = await Promise.all([
    db.from("candidates").select("first_name, last_name, email").eq("id", original.candidate_id).maybeSingle(),
    original.sent_by ? db.from("profiles").select("email").eq("id", original.sent_by).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const name = `${candidate?.first_name ?? ""} ${candidate?.last_name ?? ""}`.trim() || from || "Kandidat"
  await db.from("candidate_history").insert({
    candidate_id: original.candidate_id,
    type: "email",
    content: `Antwort per E-Mail: „${subject}“`,
  })

  // Kopie an den Mitarbeiter, der die Mail geschickt hat.
  if (employee?.email) {
    const link = `${APP_BASE_URL}/dashboard/candidates/${original.candidate_id}`
    await sendEmail(
      [employee.email],
      `Antwort von ${name}: ${subject}`,
      renderEmailLayout({
        heading: `Antwort von ${escapeHtml(name)}`,
        contentHtml: `<p style="margin:0 0 8px;color:#6b7280;font-size:13px;">${escapeHtml(subject)}</p><div style="white-space:pre-wrap;border-left:3px solid #dde3ea;padding-left:12px;">${escapeHtml(body)}</div>${emailButton(link, "Im Kandidatenwerk öffnen")}`,
        footerNote: "Die Antwort steht auch im Reiter „Kommunikation“ beim Kandidaten.",
      }),
      candidate?.email ? { replyTo: { email: candidate.email, name } } : {}
    )
  }
  return "zugeordnet"
}
