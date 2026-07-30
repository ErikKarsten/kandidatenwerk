// Sauberer Reimport aller Leadtable-Leads über die bereits in Kandidatenwerk angelegten
// Kampagnen (leadtable_campaign_id IS NOT NULL), diesmal mit direkter campaign_id/client_id-
// Verknüpfung statt nur Notizen-Text. Läuft bewusst als reines Node-Skript (nicht über den
// Cloudflare Worker), um das Subrequest-Limit von Workers zu umgehen.
//
// Usage:
//   npx tsx scripts/leadtable-full-reimport.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { importLeadtableCampaign } from "../src/lib/leadtable-import"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 200
const PROGRESS_EVERY = 20

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const startedAt = Date.now()

  console.log("=== Kampagnen mit leadtable_campaign_id laden ===")
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, title, leadtable_campaign_id")
    .not("leadtable_campaign_id", "is", null)

  if (campaignsError) throw new Error(campaignsError.message)

  const list = campaigns ?? []
  console.log(`${list.length} Kampagnen geladen`)
  console.log("")

  const totals = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errors: 0,
  }
  const runErrors: { campaign: string; message: string }[] = []
  let sinceLastProgress = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errors: 0,
  }

  function printProgress(index: number) {
    console.log(
      `[${index}/${list.length}] Zwischensumme (letzte ${PROGRESS_EVERY} Kampagnen): ` +
        `created: ${sinceLastProgress.created}, skippedAbsage: ${sinceLastProgress.skippedAbsage}, ` +
        `skippedNoEmail: ${sinceLastProgress.skippedNoEmail}, skippedDuplicate: ${sinceLastProgress.skippedDuplicate}, ` +
        `errors: ${sinceLastProgress.errors} | Gesamt bisher: created: ${totals.created}, ` +
        `skippedAbsage: ${totals.skippedAbsage}, skippedNoEmail: ${totals.skippedNoEmail}, ` +
        `skippedDuplicate: ${totals.skippedDuplicate}, errors: ${totals.errors}`
    )
    sinceLastProgress = { created: 0, skippedAbsage: 0, skippedNoEmail: 0, skippedDuplicate: 0, errors: 0 }
  }

  for (let i = 0; i < list.length; i++) {
    const campaign = list[i]

    try {
      await sleep(DELAY_MS)
      const result = await importLeadtableCampaign(
        "", // customerId wird von importLeadtableCampaign aktuell nicht genutzt (void customerId)
        campaign.leadtable_campaign_id!,
        campaign.title,
        campaign.id
      )

      totals.created += result.created
      totals.skippedAbsage += result.skippedAbsage
      totals.skippedNoEmail += result.skippedNoEmail
      totals.skippedDuplicate += result.skippedDuplicate
      totals.errors += result.errors.length

      sinceLastProgress.created += result.created
      sinceLastProgress.skippedAbsage += result.skippedAbsage
      sinceLastProgress.skippedNoEmail += result.skippedNoEmail
      sinceLastProgress.skippedDuplicate += result.skippedDuplicate
      sinceLastProgress.errors += result.errors.length

      if (result.errors.length > 0) {
        console.log(`  -> Kampagne "${campaign.title}": ${result.errors.length} Lead-Fehler`)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kampagne ${i + 1}/${list.length}: "${campaign.title}" - FEHLER: ${message}`)
      runErrors.push({ campaign: campaign.title, message })
      totals.errors++
      sinceLastProgress.errors++
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      printProgress(i + 1)
    }
  }

  const durationMs = Date.now() - startedAt
  const durationSec = durationMs / 1000

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(JSON.stringify(totals, null, 2))

  if (runErrors.length > 0) {
    console.log("")
    console.log(`=== Fehler außerhalb einzelner Leads (${runErrors.length}) ===`)
    runErrors.forEach((e) => console.log(`  Kampagne "${e.campaign}": ${e.message}`))
  }

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(`Dauer: ${durationSec.toFixed(1)}s (${(durationSec / 60).toFixed(1)} Minuten) für ${list.length} Kampagnen`)
  console.log(`Ø pro Kampagne: ${(durationSec / list.length).toFixed(2)}s`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
