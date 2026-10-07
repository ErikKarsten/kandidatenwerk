// Richtet den Close-Webhook ein (Paket 17, T-54) bzw. aktualisiert die Ereignisse des
// bestehenden (Paket 30, T-127). Close schickt dann Besprechungen, Telefonate, Notizen,
// eigene Aktivitäten und Lead-Statuswechsel an /api/webhooks/close-activity. Der ausgegebene signature_key gehört als Secret
// CLOSE_WEBHOOK_SIGNATURE_KEY in den Worker (npx wrangler secret put ...).
//
// Usage: npx tsx scripts/close-webhook-setup.ts
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const URL = "https://kandidatenwerk.kanzleistelle24.de/api/webhooks/close-activity"
const auth = "Basic " + Buffer.from(`${process.env.CLOSE_API_KEY}:`).toString("base64")

async function close(method: string, p: string, body?: unknown) {
  const res = await fetch(`https://api.close.com/api/v1${p}`, {
    method,
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(json)}`)
  return json
}

const EVENTS = [
  { object_type: "activity.meeting", action: "created" },
  { object_type: "activity.meeting", action: "updated" },
  { object_type: "activity.call", action: "created" },
  { object_type: "activity.call", action: "updated" },
  { object_type: "activity.note", action: "created" },
  { object_type: "activity.custom_activity", action: "created" },
  { object_type: "activity.lead_status_change", action: "created" },
]

async function main() {
  if (!process.env.CLOSE_API_KEY) throw new Error("CLOSE_API_KEY fehlt in .env.local")
  const existing = (await close("GET", "/webhook/")).data as { id: string; url: string; status: string }[]
  const ours = existing.find((w) => w.url === URL)
  if (ours) {
    await close("PUT", `/webhook/${ours.id}/`, { events: EVENTS })
    console.log(`Webhook ${ours.id} (${ours.status}) aktualisiert: ${EVENTS.length} Ereignisse. Signature-Key bleibt gleich.`)
    return
  }
  const created = await close("POST", "/webhook/", { url: URL, events: EVENTS })
  console.log(`Webhook angelegt: ${created.id}`)
  console.log(`SIGNATURE_KEY=${created.signature_key}`)
}

main().catch((err) => {
  console.error("FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
