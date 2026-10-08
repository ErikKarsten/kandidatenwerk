// Kanzleiprofil, Benefits und Stellen eines bestehenden Kunden aus einem Close-Lead
// nachziehen (Neuimport-Nacharbeit, Paket 40) - wie im Neuimport aus Close-Feldern,
// Notizen, Formularen, Besprechungen und der Website, per KI. Füllt nur leere Felder.
//
//   npx tsx scripts/kunde-profil-nachziehen.ts <Kunden-ID> <Close-Lead-ID> [--verknuepfen]
//
// --verknuepfen setzt zusätzlich die Close-Verknüpfung des Kunden. Ohne: nur Quelle fürs
// Profil (z. B. zwei Kandidatenwerk-Kunden, die in Close ein gemeinsamer Lead sind).
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { closeGet, customActivityLabels, leadFieldLabels, type CloseLead } from "../src/lib/close-api"
import { closeLeadSources, extractProfileFromSources } from "../src/lib/close-onboarding"
import { closeLeadUrl, processCloseWebhook } from "../src/lib/close-webhook"
import { fetchWebsiteText } from "../src/lib/website-text"
import { closeActivitySources } from "./lib/close-quellen"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const [clientId, leadId] = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const LINK = process.argv.includes("--verknuepfen")

async function main() {
  if (!clientId || !leadId?.startsWith("lead_")) throw new Error("Aufruf: <Kunden-ID> <Close-Lead-ID> [--verknuepfen]")
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const { data: client, error } = await db.from("clients").select("id, name, close_lead_id").eq("id", clientId).single()
  if (error) throw new Error(`Kunde: ${error.message}`)

  if (LINK && client.close_lead_id !== leadId) {
    const { data: other } = await db.from("clients").select("name").eq("close_lead_id", leadId).maybeSingle()
    if (other) throw new Error(`Close-Lead ist schon mit „${other.name}“ verknüpft.`)
    await db.from("clients").update({ close_lead_id: leadId, close_url: closeLeadUrl(leadId) }).eq("id", clientId)
    console.log("Close verknüpft.")
  }

  const lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(leadId)}/`)
  if (!lead) throw new Error("Close-Lead nicht gefunden.")
  const [fields, types] = await Promise.all([leadFieldLabels(), customActivityLabels()])
  const sources = [...closeLeadSources(lead, fields), ...(await closeActivitySources(leadId, types))]
  const website = await fetchWebsiteText(lead.url as string | null)
  if (website) sources.push({ label: "Website der Kanzlei", text: website })
  console.log(`${client.name}: ${sources.length} Quellen aus „${lead.display_name}“`)

  const profile = await extractProfileFromSources(client.name, sources)
  await processCloseWebhook(db, { ...profile, firma: client.name }, { bulkImport: true, clientId })
  console.log("Kanzleiprofil befüllt.")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
