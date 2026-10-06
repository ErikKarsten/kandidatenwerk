// Richtet Brevo Inbound Parsing für Antworten von Kandidaten ein (Paket 19, T-89).
// Voraussetzung: MX-Einträge für die Subdomain (siehe unten) zeigen auf Brevo.
// Gibt das Token aus, das als Worker-Secret BREVO_INBOUND_TOKEN gesetzt werden muss, und
// danach INBOUND_REPLY_DOMAIN=antwort.kanzleistelle24.de setzen (schaltet die
// Antwortadressen in Mails aus "Kommunikation" um).
//
//   antwort.kanzleistelle24.de  MX 10  inbound1.sendinblue.com.
//   antwort.kanzleistelle24.de  MX 20  inbound2.sendinblue.com.
//
// Usage: npx tsx scripts/brevo-inbound-setup.ts
import path from "node:path"
import { randomBytes } from "node:crypto"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const DOMAIN = "antwort.kanzleistelle24.de"
const BASE = "https://kandidatenwerk.kanzleistelle24.de/api/webhooks/brevo-inbound"

async function brevo(method: string, p: string, body?: unknown) {
  const res = await fetch(`https://api.brevo.com/v3${p}`, {
    method,
    headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status}: ${text}`)
  return text ? JSON.parse(text) : {}
}

async function main() {
  if (!process.env.BREVO_API_KEY) throw new Error("BREVO_API_KEY fehlt in .env.local")
  const existing = (await brevo("GET", "/webhooks?type=inbound")).webhooks as { id: number; url: string; domain?: string }[] | undefined
  const ours = (existing ?? []).find((w) => w.url.startsWith(BASE))
  if (ours) {
    console.log(`Inbound-Webhook besteht bereits: ${ours.id} (${ours.domain ?? DOMAIN}).`)
    return
  }
  const token = randomBytes(24).toString("hex")
  const created = await brevo("POST", "/webhooks", {
    type: "inbound",
    events: ["inboundEmailProcessed"],
    url: `${BASE}?token=${token}`,
    domain: DOMAIN,
    description: "Kandidatenwerk: Antworten von Kandidaten",
  })
  console.log(`Inbound-Webhook angelegt: ${created.id}`)
  console.log(`TOKEN=${token}`)
}

main().catch((err) => {
  console.error("FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
