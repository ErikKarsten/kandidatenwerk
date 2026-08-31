// Einmaliges Backfill für das Standort-Feature: ordnet allen bestehenden Kampagnen mit
// PLZ rückwirkend eine location (3-stelliger PLZ-Bereich, siehe
// src/lib/location-clustering.ts) zu. Kampagnen ohne PLZ oder mit bereits gesetzter
// location_id werden übersprungen (idempotent - kann gefahrlos mehrfach laufen).
//
// Voraussetzung: Migration 20260831000000_add_locations.sql muss angewendet sein.
//
// Usage:
//   npx tsx scripts/backfill-locations.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { getOrCreateLocationForPlz } from "../src/lib/location-clustering"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const PROGRESS_EVERY = 20

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const startedAt = Date.now()

  console.log("=== Kampagnen mit PLZ, aber ohne location_id laden ===")
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, title, plz")
    .not("plz", "is", null)
    .is("location_id", null)

  if (campaignsError) throw new Error(campaignsError.message)

  const list = campaigns ?? []
  console.log(`${list.length} Kampagnen geladen`)
  console.log("")

  let assigned = 0
  let skippedInvalidPlz = 0
  const locationIdsSeen = new Set<string>()
  const runErrors: { campaign: string; message: string }[] = []

  for (let i = 0; i < list.length; i++) {
    const campaign = list[i]

    try {
      const locationId = await getOrCreateLocationForPlz(supabase, campaign.plz)

      if (!locationId) {
        skippedInvalidPlz++
        continue
      }

      const { error: updateError } = await supabase
        .from("campaigns")
        .update({ location_id: locationId })
        .eq("id", campaign.id)

      if (updateError) throw new Error(updateError.message)

      locationIdsSeen.add(locationId)
      assigned++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kampagne ${i + 1}/${list.length}: "${campaign.title}" - FEHLER: ${message}`)
      runErrors.push({ campaign: campaign.title, message })
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] zugeordnet bisher: ${assigned}, PLZ-Bereiche bisher: ` +
          `${locationIdsSeen.size}, übersprungen (ungültige PLZ): ${skippedInvalidPlz}, ` +
          `Fehler: ${runErrors.length}`
      )
    }
  }

  const durationSec = (Date.now() - startedAt) / 1000

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(
    JSON.stringify(
      {
        campaignsChecked: list.length,
        campaignsAssigned: assigned,
        distinctLocationRanges: locationIdsSeen.size,
        skippedInvalidPlz,
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
