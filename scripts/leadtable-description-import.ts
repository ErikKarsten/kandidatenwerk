// Importiert einmalig die Leadtable-Beschreibung (chronologische Freitext-Notizen)
// in candidates.description. Setzt voraus, dass leadtable_lead_id bereits per
// scripts/leadtable-status-sync.ts befüllt wurde - Kandidaten ohne gespeicherte
// Lead-ID werden übersprungen (kein zuverlässiger Weg, den Lead zu finden).
//
// Anders als beim Status-Sync gewinnt hier NICHT automatisch Leadtable: description
// wird nur gesetzt, wenn candidates.description bei uns noch leer ist - Freitext, den
// jemand seither manuell eingetragen hat, wird nicht überschrieben.
//
// HTML-zu-Text-Konvertierung in src/lib/leadtable-sync-shared.ts (gemeinsam mit
// leadtable-status-sync.ts, leadtable-backfill-fields.ts und der
// refreshLeadtableCandidateAction Server Action).
//
// Usage:
//   npx tsx scripts/leadtable-description-import.ts            (alle Kandidaten)
//   npx tsx scripts/leadtable-description-import.ts --limit=15 (nur die ersten 15, zum Testen)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { type LeadtableSyncLead, sleep, withRetry, htmlDescriptionToPlainText } from "../src/lib/leadtable-sync-shared"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 250
const PROGRESS_EVERY = 30

function parseLimitArg(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="))
  if (!arg) return null
  const value = Number(arg.split("=")[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const limit = parseLimitArg()
  const startedAt = Date.now()

  console.log("=== Leadtable-Kandidaten mit gespeicherter leadtable_lead_id laden ===")
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, description, leadtable_lead_id")
    .eq("source", "leadtable")
    .not("leadtable_lead_id", "is", null)

  if (error) throw new Error(error.message)

  let list = candidates ?? []
  console.log(`${list.length} Kandidaten mit leadtable_lead_id geladen`)
  if (limit) {
    list = list.slice(0, limit)
    console.log(`Test-Limit aktiv: nur die ersten ${list.length} Kandidaten`)
  }
  console.log("")

  const totals = {
    set: 0,
    skippedAlreadySet: 0,
    skippedEmptyAtLeadtable: 0,
    notFound: 0,
    errors: 0,
  }
  const examples: { name: string; text: string }[] = []
  const errorDetails: { name: string; id: string; message: string }[] = []

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const name = `${candidate.first_name} ${candidate.last_name}`

    try {
      await sleep(DELAY_MS)
      const resp = await withRetry(() =>
        leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${candidate.leadtable_lead_id}`)
      )
      const rawHtml = resp.lead.description?.trim() ?? ""
      const description = rawHtml === "" ? "" : htmlDescriptionToPlainText(rawHtml)

      if (description === "") {
        totals.skippedEmptyAtLeadtable++
      } else {
        const hasExisting = typeof candidate.description === "string" && candidate.description.trim() !== ""

        if (hasExisting) {
          totals.skippedAlreadySet++
        } else {
          const { error: updateError } = await supabase
            .from("candidates")
            .update({ description })
            .eq("id", candidate.id)

          if (updateError) throw new Error(updateError.message)

          totals.set++
          if (examples.length < 3) examples.push({ name, text: description })
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("404")) {
        totals.notFound++
      } else {
        totals.errors++
        errorDetails.push({ name, id: candidate.id, message })
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] Zwischensumme: gesetzt: ${totals.set}, ` +
          `übersprungen (schon vorhanden): ${totals.skippedAlreadySet}, ` +
          `übersprungen (bei Leadtable leer): ${totals.skippedEmptyAtLeadtable}, ` +
          `nicht gefunden: ${totals.notFound}, Fehler: ${totals.errors}`
      )
    }
  }

  const durationSec = (Date.now() - startedAt) / 1000

  console.log("")
  console.log("=== Beispiel-Texte (erste 3 gesetzte) ===")
  examples.forEach((e) => console.log(`  ${e.name}:\n  "${e.text}"\n`))

  if (errorDetails.length > 0) {
    console.log("=== Fehler ===")
    errorDetails.forEach((e) => console.log(`  ${e.name} [${e.id}]: ${e.message}`))
    console.log("")
  }

  console.log("=== Gesamtsumme ===")
  console.log(JSON.stringify(totals, null, 2))

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(`Dauer: ${durationSec.toFixed(1)}s für ${list.length} Kandidaten`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
