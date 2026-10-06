// Passwort zurücksetzen (Paket 20, T-91): Link zum Neusetzen über die Supabase-Admin-API
// (wie die Einladung - führt auf /set-password), verschickt im einheitlichen Mail-Layout.
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { sendEmail } from "@/lib/brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"

const REDIRECT = "https://kandidatenwerk.kanzleistelle24.de/set-password"

export async function createPasswordResetLink(email: string): Promise<string> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: REDIRECT } })
  if (error) throw new Error(error.message)
  const link = data.properties?.action_link
  if (!link) throw new Error("Link konnte nicht erzeugt werden.")
  return link
}

// Mail mit dem Link: "einladung" für neue Zugänge (Ansprechpartner/Portal-Zugang, Paket 23),
// "passwort" zum Zurücksetzen. Beide führen auf /set-password.
export async function sendPortalAccessMail(email: string, link: string, kind: "einladung" | "passwort"): Promise<void> {
  const invite = kind === "einladung"
  await sendEmail(
    [email],
    invite ? "Ihr Zugang zum Kunden-Portal" : "Neues Passwort für Kandidatenwerk festlegen",
    renderEmailLayout({
      subtitle: "Kunden-Portal",
      heading: invite ? "Sie wurden zum Kunden-Portal eingeladen" : "Neues Passwort festlegen",
      contentHtml: `${
        invite
          ? `<p style="margin:0;">Über Ihr persönliches Kunden-Portal behalten Sie jederzeit den Überblick:</p><ul style="margin:10px 0 0;padding-left:20px;"><li>Neue Kandidat:innen und deren Unterlagen ansehen</li><li>Rückmeldung geben, z.B. Vorstellungsgespräch vereinbart</li><li>Ihre Kampagnen und Ihren Ansprechpartner im Blick</li></ul>`
          : `<p style="margin:0;">Für Ihren Zugang wurde ein neues Passwort angefordert. Über den Knopf legen Sie es fest.</p>`
      }${emailButton(link, invite ? "Zugang einrichten" : "Neues Passwort festlegen")}<p style="margin:12px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Der Link ist aus Sicherheitsgründen zeitlich begrenzt gültig. Falls der Knopf nicht funktioniert:<br><a href="${link}" style="color:#1e56a0;word-break:break-all;">${link}</a></p>`,
      footerNote: invite
        ? `Diese Einladung wurde an ${email} gesendet. Falls Sie sie nicht erwartet haben, können Sie diese E-Mail ignorieren.`
        : `Diese E-Mail wurde an ${email} gesendet. Wenn Sie kein neues Passwort angefordert haben, können Sie sie ignorieren – Ihr bisheriges Passwort bleibt gültig.`,
    })
  )
}

export async function sendPasswordResetMail(email: string, link: string): Promise<void> {
  await sendPortalAccessMail(email, link, "passwort")
}
