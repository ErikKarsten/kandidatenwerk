// Kontaktdaten der Musterdatensätze (Paket 76).
// E-Mail: nie bei einem öffentlichen Mailanbieter - erfundene Adressen wie
// vorname.nachname@gmail.com gehören oft echten Menschen, die dann Post von Kanzleien
// bekämen. Standard ist example.com (reserviert, Mails kommen nirgends an); eine eigene
// Domain (z. B. mit Weiterleitung aller Adressen an das Team) per SAMPLE_EMAIL_DOMAIN.
// Telefon: Nummern aus SAMPLE_PHONE_NUMBERS (kommagetrennt, eigene Nummern des Teams),
// sonst der für fiktive Nummern reservierte Bereich 030 23125.

const PUBLIC_MAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "outlook.de", "hotmail.com", "hotmail.de", "live.com", "live.de", "msn.com",
  "yahoo.com", "yahoo.de", "gmx.de", "gmx.net", "gmx.at", "gmx.ch", "web.de", "t-online.de", "icloud.com", "me.com", "aol.com",
  "freenet.de", "posteo.de", "mail.de", "mailbox.org", "proton.me", "protonmail.com", "online.de", "arcor.de", "vodafone.de",
])

export const DEFAULT_SAMPLE_EMAIL_DOMAIN = "example.com"

export function isPublicMailDomain(domain: string): boolean {
  return PUBLIC_MAIL_DOMAINS.has(domain.trim().toLowerCase())
}

export function sampleEmailDomain(configured = process.env.SAMPLE_EMAIL_DOMAIN): string {
  const domain = (configured ?? "").trim().toLowerCase().replace(/^@/, "")
  if (!domain || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) || isPublicMailDomain(domain)) return DEFAULT_SAMPLE_EMAIL_DOMAIN
  return domain
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
