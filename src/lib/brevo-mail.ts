// Versand von Transactional-E-Mails über die Brevo-API (POST /v3/smtp/email). Bewusst
// getrennt von der SMTP-Konfiguration, die Supabase Auth für Login-/Bestätigungsmails
// nutzt - anderer Schlüsseltyp (BREVO_API_KEY beginnt mit "xkeysib-", der SMTP-Key mit
// "xsmtpsib-"). Absender ist dieselbe verifizierte Adresse wie bei den Supabase-Auth-
// Mails, damit Zustellbarkeit/SPF-DKIM-Setup nicht doppelt gepflegt werden muss.
const SENDER_EMAIL = "noreply@kanzleistelle24.de"
const SENDER_NAME = "Kandidatenwerk"

export async function sendEmail(
  to: string[],
  subject: string,
  htmlContent: string
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
      sender: { email: SENDER_EMAIL, name: SENDER_NAME },
      to: to.map((email) => ({ email })),
      subject,
      htmlContent,
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`Brevo-Versand fehlgeschlagen (${response.status}): ${body}`)
  }
}
