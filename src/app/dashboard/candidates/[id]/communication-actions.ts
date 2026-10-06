"use server"

// Reiter "Kommunikation" (Paket 18, T-84): E-Mail aus dem Kandidatenprofil an den
// Kandidaten. Absender info@kanzleistelle24.de mit dem Namen des Mitarbeiters, Antworten
// gehen an dessen Adresse. Jede Mail landet in candidate_messages und im Verlauf.
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { sendEmail } from "@/lib/brevo-mail"
import { wrapAutomationEmailHtml } from "@/lib/automation-engine"
import { randomUUID } from "node:crypto"
import { replyAddressFor } from "@/lib/inbound-replies"

export async function sendCandidateEmailAction(
  candidateId: string,
  input: { subject: string; body: string }
): Promise<{ error: string } | null> {
  const subject = input.subject.trim()
  const body = input.body.trim()
  if (!subject) return { error: "Bitte einen Betreff eingeben." }
  if (!body) return { error: "Bitte einen Text eingeben." }
  if (/#(Kandidatenname|Kampagnenname|Kundenname|Email|Telefon|Bewerberlink)\b/.test(`${subject}\n${body}`)) {
    return { error: "Im Text stehen noch Platzhalter (#...). Bitte vor dem Senden ersetzen." }
  }

  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return ctx

  const [{ data: candidate }, { data: me }] = await Promise.all([
    supabase.from("candidates").select("email, is_demo").eq("id", candidateId).maybeSingle(),
    supabase.from("profiles").select("full_name, email").eq("id", ctx.staff.userId).maybeSingle(),
  ])
  if (!candidate) return { error: "Kandidat nicht gefunden." }
  if (candidate.is_demo) return { error: "An den Beispiel-Lead werden keine Mails verschickt." }
  const to = candidate.email?.trim()
  if (!to) return { error: "Für den Kandidaten ist keine E-Mail-Adresse hinterlegt." }

  const name = me?.full_name?.trim()
  // Mit eingerichteter Antwort-Domain (Paket 19, T-89) laufen Antworten über das
  // Kandidatenwerk (Kopie an den Mitarbeiter), sonst direkt an den Mitarbeiter.
  const messageId = randomUUID()
  const inboundAddress = replyAddressFor(messageId)
  const replyTo = inboundAddress
    ? { email: inboundAddress, ...(name ? { name } : {}) }
    : me?.email
      ? { email: me.email, ...(name ? { name } : {}) }
      : undefined
  let status = "gesendet"
  let sendError: string | null = null
  try {
    await sendEmail([to], subject, wrapAutomationEmailHtml(body, name ? `Gesendet von ${name} · Endlich Mitarbeiter` : null), {
      senderName: name ? `${name} | Endlich Mitarbeiter` : "Endlich Mitarbeiter",
      replyTo,
    })
  } catch (err) {
    status = "fehler"
    sendError = err instanceof Error ? err.message : String(err)
  }

  await supabase.from("candidate_messages").insert({
    id: messageId,
    candidate_id: candidateId,
    channel: "email",
    direction: "ausgehend",
    to_address: to,
    subject,
    body,
    sent_by: ctx.staff.userId,
    reply_to: replyTo?.email ?? null,
    status,
    error: sendError,
  })
  if (!sendError) {
    await supabase.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "email",
      content: `E-Mail an ${to}: „${subject}“`,
      created_by: ctx.staff.userId,
    })
  }
  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return sendError ? { error: `Versand fehlgeschlagen: ${sendError}` } : null
}
