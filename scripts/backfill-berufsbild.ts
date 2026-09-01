// Einmaliges Backfill für den Berufsbild-Erkennungs-Fix (siehe mapKanzleistelleBerufsbild()
// in src/lib/sync-kanzleistelle.ts): geht rückwirkend alle Kampagnen mit berufsbild = null
// durch und wendet die verbesserte Erkennung erneut auf den Titel an. Bei Erfolg wird
// zusätzlich jeder Kandidat dieser Kampagne aktualisiert, der selbst noch kein
// berufsbild hat - bereits (auch manuell) gesetzte Kandidaten-Werte bleiben unangetastet.
//
// Usage:
//   npx tsx scripts/backfill-berufsbild.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const PROGRESS_EVERY = 10

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const startedAt = Date.now()

  console.log("=== Kampagnen mit berufsbild = null laden ===")
  const { data: campaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id, title")
    .is("berufsbild", null)

  if (campaignsError) throw new Error(campaignsError.message)

  const list = campaigns ?? []
  console.log(`${list.length} Kampagnen geladen`)
  console.log("")

  let campaignsAssigned = 0
  let candidatesUpdated = 0
  let stillNull = 0
  const stillNullTitles: string[] = []
  const runErrors: { campaign: string; message: string }[] = []

  for (let i = 0; i < list.length; i++) {
    const campaign = list[i]

    try {
      const berufsbild = mapKanzleistelleBerufsbild(campaign.title)

      if (!berufsbild) {
        stillNull++
        stillNullTitles.push(campaign.title)
        continue
      }

      const { error: campaignUpdateError } = await supabase
        .from("campaigns")
        .update({ berufsbild })
        .eq("id", campaign.id)

      if (campaignUpdateError) throw new Error(campaignUpdateError.message)

      campaignsAssigned++

      // Nur Kandidaten dieser Kampagne aktualisieren, die selbst noch kein berufsbild
      // haben - .select("id") liefert die betroffenen Zeilen zurück, um sie zu zählen.
      const { data: updatedCandidates, error: candidatesUpdateError } = await supabase
        .from("candidates")
        .update({ berufsbild })
        .eq("campaign_id", campaign.id)
        .is("berufsbild", null)
        .select("id")

      if (candidatesUpdateError) throw new Error(candidatesUpdateError.message)

      candidatesUpdated += updatedCandidates?.length ?? 0
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kampagne ${i + 1}/${list.length}: "${campaign.title}" - FEHLER: ${message}`)
      runErrors.push({ campaign: campaign.title, message })
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] Kampagnen zugeordnet bisher: ${campaignsAssigned}, ` +
          `Kandidaten aktualisiert bisher: ${candidatesUpdated}, weiterhin null: ${stillNull}, ` +
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
        campaignsAssigned,
        candidatesUpdated,
        stillNull,
        errorCount: runErrors.length,
      },
      null,
      2
    )
  )

  if (stillNullTitles.length > 0) {
    console.log("")
    console.log(`=== Weiterhin null (${stillNullTitles.length}) - bewusst nicht angefasst ===`)
    stillNullTitles.forEach((t) => console.log(`  "${t}"`))
  }

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
