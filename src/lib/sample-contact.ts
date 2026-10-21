// Kontaktdaten der Musterdatensätze (Paket 76).
// E-Mail: Adressen bei gängigen Mailanbietern (gmail.com, gmx.de, yahoo.com, freenet.de),
// damit sie im Portal wie echte aussehen - die Kanzleien erfahren im persönlichen Gespräch,
// dass es Beispielkandidaten sind. Verschickt wird an diese Adressen nie etwas (siehe
// sampleOnlyAddresses in brevo-mail.ts und resolveAutomationRecipients). Eine feste eigene
// Domain statt der Liste per SAMPLE_EMAIL_DOMAIN.
// Telefon: Nummern aus SAMPLE_PHONE_NUMBERS (kommagetrennt, eigene Nummern des Teams),
// sonst der für fiktive Nummern reservierte Bereich 030 23125.

export const SAMPLE_EMAIL_DOMAINS = ["gmail.com", "gmx.de", "yahoo.com", "freenet.de"]

export function sampleEmailDomain(random: () => number = Math.random, configured = process.env.SAMPLE_EMAIL_DOMAIN): string {
  const domain = (configured ?? "").trim().toLowerCase().replace(/^@/, "")
  if (domain && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return domain
  return SAMPLE_EMAIL_DOMAINS[Math.floor(random() * SAMPLE_EMAIL_DOMAINS.length)]
}

// Reservierte Domains (RFC 2606/6761): Mails dorthin gar nicht erst verschicken.
export function isUndeliverableAddress(email: string): boolean {
  return /@(example\.(com|org|net)|[^@\s]+\.(test|invalid|example|localhost))$/i.test(email.trim())
}

export function samplePhone(random: () => number = Math.random, configured = process.env.SAMPLE_PHONE_NUMBERS): string {
  const list = (configured ?? "").split(",").map((n) => n.trim()).filter(Boolean)
  if (list.length) return list[Math.floor(random() * list.length)]
  return `+49 30 23125 ${200 + Math.floor(random() * 800)}`
}
