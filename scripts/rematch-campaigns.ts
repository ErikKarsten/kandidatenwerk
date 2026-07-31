// Stößt das automatische Matching nachträglich für alle aktiven Kampagnen an, die
// berufsbild UND plz gesetzt haben — insbesondere für Kampagnen, die vor der
// PLZ-Ergänzung (leadtable-clients-geocode.ts) entstanden sind und daher noch nie
// gematcht wurden. matchCampaignToCandidates() hat einen ON CONFLICT DO NOTHING-Schutz
// (upsert mit ignoreDuplicates), überschreibt also keine bestehenden Matches.
//
// Usage:
//   npx tsx scripts/rematch-campaigns.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { matchCampaignToCandidates } from "../src/lib/matching"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 100
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

  console.log("=== Aktive Kampagnen mit berufsbild UND plz laden ===")
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, title")
    .eq("status", "active")
    .not("berufsbild", "is", null)
    .not("plz", "is", null)

  if (campaignsError) throw new Error(campaignsError.message)

  const list = campaigns ?? []
  console.log(`${list.length} Kampagnen geladen`)
  console.log("")

  async function countMatches(): Promise<number> {
    const { count, error } = await supabase
      .from("candidate_campaign_matches")
      .select("id", { count: "exact", head: true })
    if (error) throw new Error(error.message)
    return count ?? 0
  }

  const matchesBefore = await countMatches()

  const runErrors: { campaign: string; message: string }[] = []
  let lastProgressCount = matchesBefore

  for (let i = 0; i < list.length; i++) {
    const campaign = list[i]

    try {
      await sleep(DELAY_MS)
      await matchCampaignToCandidates(supabase, campaign.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kampagne ${i + 1}/${list.length}: "${campaign.title}" - FEHLER: ${message}`)
      runErrors.push({ campaign: campaign.title, message })
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      const currentCount = await countMatches()
      const newSinceLastProgress = currentCount - lastProgressCount
      const newTotal = currentCount - matchesBefore
      console.log(
        `[${i + 1}/${list.length}] Zwischensumme (letzte ${PROGRESS_EVERY} Kampagnen): ` +
          `neue Matches: ${newSinceLastProgress} | Gesamt neue Matches bisher: ${newTotal}, errors: ${runErrors.length}`
      )
      lastProgressCount = currentCount
    }
  }

  const matchesAfter = await countMatches()
  const durationMs = Date.now() - startedAt
  const durationSec = durationMs / 1000

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(
    JSON.stringify(
      {
        campaignsChecked: list.length,
        matchesBefore,
        matchesAfter,
        newMatches: matchesAfter - matchesBefore,
        errorCount: runErrors.length,
      },
      null,
      2
    )
  )

  if (runErrors.length > 0) {
    console.log("")
    console.log(`=== Fehler (${runErrors.length}) ===`)
    runErrors.forEach((e) => console.log(`  Kampagne "${e.campaign}": ${e.message}`))
  }

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(`Dauer: ${durationSec.toFixed(1)}s (${(durationSec / 60).toFixed(1)} Minuten) für ${list.length} Kampagnen`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
