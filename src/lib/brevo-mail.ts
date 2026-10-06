import { applyEmailLogo, hasEmailLayout, renderEmailLayout } from "@/lib/email-layout"
import { createClient } from "@supabase/supabase-js"

// Logo aus den Kontoeinstellungen (agency_settings.logo_url), 5 Minuten zwischengespeichert.
// Fehler beim Laden blockieren nie den Versand - dann bleibt das Kandidatenwerk-Symbol.
let logoCache: { url: string | null; at: number } | null = null
async function getEmailLogoUrl(): Promise<string | null> {
  if (logoCache && Date.now() - logoCache.at < 5 * 60_000) return logoCache.url
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SECRET_KEY
    if (!url || !key) return null
    const { data } = await createClient(url, key).from("agency_settings").select("logo_url").not("logo_url", "is", null).limit(1).maybeSingle()
    logoCache = { url: (data?.logo_url as string | null) ?? null, at: Date.now() }
    return logoCache.url
  } catch {
    return null
  }
}
// Versand von Transactional-E-Mails über die Brevo-API (POST /v3/smtp/email). Bewusst
// getrennt von der SMTP-Konfiguration, die Supabase Auth für Login-/Bestätigungsmails
// nutzt - anderer Schlüsseltyp (BREVO_API_KEY beginnt mit "xkeysib-", der SMTP-Key mit
// "xsmtpsib-"). Absender ist info@kanzleistelle24.de (Umstellung von noreply@ am
// 22.09.2026, abgesprochen) - gleiche bei Brevo verifizierte Domain, SPF/DKIM gilt
// dadurch unverändert weiter, keine erneute Domain-Verifizierung nötig.
const SENDER_EMAIL = "info@kanzleistelle24.de"
const SENDER_NAME = "Kandidatenwerk"

// options (Paket 18): eigener Absendername (Adresse bleibt info@) und Antwortadresse,
// z.B. für Mails aus dem Reiter "Kommunikation" im Namen eines Mitarbeiters.
export async function sendEmail(
  to: string[],
  subject: string,
  htmlContent: string,
  options: { senderName?: string; replyTo?: { email: string; name?: string }; footerSender?: string } = {}
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) throw new Error("BREVO_API_KEY ist nicht gesetzt.")
  if (to.length === 0) throw new Error("Keine Empfänger angegeben.")

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { email: SENDER_EMAIL, name: options.senderName || SENDER_NAME },
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      to: to.map((email) => ({ email })),
      subject,
      // Einheitliches Layout für alle Mails (Paket 19, T-87).
      htmlContent: applyEmailLogo(
        hasEmailLayout(htmlContent) ? htmlContent : renderEmailLayout({ contentHtml: htmlContent, footerSender: options.footerSender }),
        await getEmailLogoUrl()
      ),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Brevo-Versand fehlgeschlagen (${response.status}): ${body}`)
  }
}
