// Mail-Sperre für Staging (Paket 102). Auf Staging (APP_ENV=staging, gesetzt in
// wrangler.jsonc bzw. scripts/dev-staging.sh) gehen Mails nur an Adressen aus
// MAIL_ALLOWLIST (.env.staging). Ist die Liste leer, geht auf Staging gar nichts raus.
// Live (APP_ENV nicht gesetzt) bleibt alles unverändert.
//
// MAIL_ALLOWLIST: durch Komma getrennt, je Eintrag eine Domain ("firma.de" oder
// "@firma.de") oder eine Adresse ("name@firma.de" - gilt auch für Plus-Adressen wie
// "name+kanzlei@firma.de", die die Staging-Testdaten nutzen).

type Env = Record<string, string | undefined>

export function isStaging(env: Env = process.env): boolean {
  return env.APP_ENV === "staging"
}

function withoutPlusTag(email: string): string {
  const [local, domain] = email.split("@")
  return `${local.split("+")[0]}@${domain}`
}

export function isAllowedOnStaging(email: string, allowlist: string | undefined): boolean {
  const address = email.trim().toLowerCase()
  if (!address.includes("@")) return false
  const domain = address.slice(address.lastIndexOf("@") + 1)
  return (allowlist ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean)
    .some((entry) => (entry.includes("@") ? withoutPlusTag(address) === withoutPlusTag(entry) : domain === entry))
}

// Liefert die Empfänger, an die verschickt werden darf (live: alle).
export function filterMailRecipients(addresses: string[], env: Env = process.env): string[] {
  if (!isStaging(env)) return addresses
  return addresses.filter((email) => isAllowedOnStaging(email, env.MAIL_ALLOWLIST))
}

export function stagingSubject(subject: string, env: Env = process.env): string {
  return isStaging(env) ? `[Staging] ${subject}` : subject
}
