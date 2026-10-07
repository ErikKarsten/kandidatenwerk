// Stammdaten-Kontakt (Name, E-Mail, Telefon) für bestehende Close-Kunden aus dem Close-Lead
// nachtragen (Paket 35) - nur leere Felder. Hauptkontakt wie bei der Übernahme
// (payloadFromLead): erster Kontakt mit E-Mail.
//
// Usage: npx tsx scripts/close-contact-backfill.ts            (Probelauf)
//        npx tsx scripts/close-contact-backfill.ts --ausfuehren
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { closeGet, type CloseLead } from "../src/lib/close-api"
import { payloadFromLead } from "../src/lib/close-onboarding"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })
const execute = process.argv.includes("--ausfuehren")
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

async function main() {
  const { data: clients, error } = await db
    .from("clients")
    .select("id, name, close_lead_id, contact_name, contact_email, phone")
    .not("close_lead_id", "is", null)
    .or("contact_name.is.null,contact_email.is.null,phone.is.null")
  if (error) throw new Error(error.message)
  let changed = 0
  for (const c of clients ?? []) {
    let lead: CloseLead | null = null
    try {
      lead = await closeGet<CloseLead>(`/lead/${encodeURIComponent(c.close_lead_id as string)}/?_fields=id,contacts`)
    } catch (err) {
      console.log(`${c.name}: übersprungen (${err instanceof Error ? err.message.slice(0, 40) : err})`)
      continue
    }
    if (!lead) continue
    const p = payloadFromLead(lead, null)
    const updates: Record<string, string> = {}
    if (!c.contact_name && p.ansprechpartner_name) updates.contact_name = p.ansprechpartner_name
    if (!c.contact_email && p.email) updates.contact_email = p.email.toLowerCase()
    if (!c.phone && p.telefon) updates.phone = p.telefon
    if (Object.keys(updates).length === 0) continue
    changed++
    console.log(`${c.name}: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ")}`)
    if (execute) {
      const { error: updateError } = await db.from("clients").update(updates).eq("id", c.id)
      if (updateError) console.error(`  FEHLER: ${updateError.message}`)
    }
  }
  console.log(`\n${changed} Kunden ${execute ? "aktualisiert" : "würden aktualisiert (Probelauf)"}.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
