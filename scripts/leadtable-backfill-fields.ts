// Backfill von 4 verifizierten Zusatzfeldern aus Leadtables modifiedData in
// candidates.custom_fields (Merge, keine bestehenden Felder überschreiben).
// Läuft bewusst als reines Node-Skript (nicht über den Cloudflare Worker),
// um das Subrequest-Limit von Workers zu umgehen.
//
// Feld-Zuordnung und Extraktion in src/lib/leadtable-sync-shared.ts (gemeinsam mit
// leadtable-status-sync.ts, leadtable-description-import.ts und der
// refreshLeadtableCandidateAction Server Action).
//
// Usage:
//   npx tsx scripts/leadtable-backfill-fields.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json } from "../src/types/database"
import { sleep, extractLeadtableCustomFields, findLeadByEmailWithFallback } from "../src/lib/leadtable-sync-shared"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 250
const PROGRESS_EVERY = 30

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const startedAt = Date.now()

  console.log("=== Leadtable-Kandidaten mit E-Mail laden ===")
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, email, custom_fields, campaign_id")
    .eq("source", "leadtable")
    .not("email", "is", null)

  if (error) throw new Error(error.message)

  const list = candidates ?? []
  console.log(`${list.length} Kandidaten geladen`)
  console.log("")

  // campaign_id (Kandidatenwerk) -> leadtable_campaign_id, für den Kampagnen-Fallback
  // bei fehlgeschlagener E-Mail-Suche (siehe findLeadByEmailWithFallback).
  const { data: campaignRows } = await supabase
    .from("campaigns")
    .select("id, leadtable_campaign_id")
    .not("leadtable_campaign_id", "is", null)
  const leadtableCampaignIdByCampaignId = new Map(
    (campaignRows ?? []).map((c) => [c.id, c.leadtable_campaign_id as string])
  )

  const totals = {
    updated: 0,
    skippedNoLead: 0,
    skippedNoMatchingFields: 0,
    errors: 0,
  }
  let sinceLastProgress = 0

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const email = (candidate.email ?? "").trim().split(/\s+/)[0]

    try {
      await sleep(DELAY_MS)
      const leadtableCampaignId = candidate.campaign_id
        ? (leadtableCampaignIdByCampaignId.get(candidate.campaign_id) ?? null)
        : null
      const lead = await findLeadByEmailWithFallback(email, leadtableCampaignId)

      if (!lead) {
        totals.skippedNoLead++
      } else {
        const newFields = extractLeadtableCustomFields(lead.modifiedData)

        if (Object.keys(newFields).length === 0) {
          totals.skippedNoMatchingFields++
        } else {
          const existingFields = (candidate.custom_fields as Record<string, string> | null) ?? {}
          const mergedFields: Record<string, string> = { ...newFields, ...existingFields }

          const { error: updateError } = await supabase
            .from("candidates")
            .update({ custom_fields: mergedFields as Json })
            .eq("id", candidate.id)

          if (updateError) throw new Error(updateError.message)

          totals.updated++
          sinceLastProgress++
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("404")) {
        totals.skippedNoLead++
      } else {
        totals.errors++
        console.log(`Kandidat ${i + 1}/${list.length} (${candidate.id}): FEHLER - ${message}`)
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] Zwischensumme: updated: ${totals.updated} (davon neu in dieser Charge: ${sinceLastProgress}), ` +
          `skippedNoLead: ${totals.skippedNoLead}, skippedNoMatchingFields: ${totals.skippedNoMatchingFields}, errors: ${totals.errors}`
      )
      sinceLastProgress = 0
    }
  }

  const durationSec = (Date.now() - startedAt) / 1000

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(JSON.stringify(totals, null, 2))

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(`Dauer: ${durationSec.toFixed(1)}s (${(durationSec / 60).toFixed(1)} Minuten) für ${list.length} Kandidaten`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
