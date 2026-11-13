// Adresse der App für Links in Mails und Weiterleitungen (Paket 102). Live ist das
// kandidatenwerk.kanzleistelle24.de. Staging und die lokale Entwicklung setzen
// NEXT_PUBLIC_APP_URL (.env.staging bzw. scripts/dev-staging.sh), damit Links aus
// Test-Mails nicht auf Live zeigen. NEXT_PUBLIC_* wird beim Bauen fest eingesetzt.
export const LIVE_APP_URL = "https://kandidatenwerk.kanzleistelle24.de"
export const APP_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || LIVE_APP_URL).replace(/\/+$/, "")
