// Backfill von 4 verifizierten Zusatzfeldern aus Leadtables modifiedData in
// candidates.custom_fields (Merge, keine bestehenden Felder überschreiben).
// Läuft bewusst als reines Node-Skript (nicht über den Cloudflare Worker),
// um das Subrequest-Limit von Workers zu umgehen.
//
// Verifizierte Feld-Zuordnung (siehe Bestandsaufnahme, 50-Kandidaten-Stichprobe):
//   q_rwi3pf  -> ausbildung       (Plausibilitäts-Check: braucht mind. 3 Buchstaben,
//                                  da diese ID in mind. 1 Kampagne etwas anderes bedeutet)
//   q_gy0zcd  -> erreichbarkeit
//   q_x8gp0p  -> verfuegbar_ab
//   q_11kc69j -> wechselgrund
//
// Usage:
//   npx tsx scripts/leadtable-backfill-fields.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 250
const PROGRESS_EVERY = 30

const FIELD_MAP: Record<string, string> = {
  q_gy0zcd: "erreichbarkeit",
  q_x8gp0p: "verfuegbar_ab",
  q_11kc69j: "wechselgrund",
}
const AUSBILDUNG_ID = "q_rwi3pf"
const AUSBILDUNG_FIELD = "ausbildung"

// Mindestens 3 Buchstaben (a-z, inkl. Umlaute/ß) — filtert reine Zahlen-/Zeitangaben
// wie den bekannten "10-11"-Ausreißer aus der Verifikation.
const LOOKS_LIKE_TEXT_RE = /[a-zäöüßA-ZÄÖÜ]{3,}/

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("429") && attempt < retries - 1) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
  throw new Error("unreachable")
}

interface LeadtableLead {
  _id: string
  modifiedData?: Record<string, unknown>
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const startedAt = Date.now()

  console.log("=== Leadtable-Kandidaten mit E-Mail laden ===")
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, email, custom_fields")
    .eq("source", "leadtable")
    .not("email", "is", null)

  if (error) throw new Error(error.message)

  const list = candidates ?? []
  console.log(`${list.length} Kandidaten geladen`)
  console.log("")

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
      const resp = await withRetry(() =>
        leadtableFetch<{ leads: LeadtableLead[] }>(`/searchLeadByMail/${encodeURIComponent(email)}`)
      )
      const lead = resp.leads[0]

      if (!lead) {
        totals.skippedNoLead++
      } else {
        const modifiedData = lead.modifiedData ?? {}
        const newFields: Record<string, string> = {}

        for (const [questionId, fieldName] of Object.entries(FIELD_MAP)) {
          const value = modifiedData[questionId]
          if (typeof value === "string" && value.trim() !== "") {
            newFields[fieldName] = value
          }
        }

        const ausbildungValue = modifiedData[AUSBILDUNG_ID]
        if (typeof ausbildungValue === "string" && LOOKS_LIKE_TEXT_RE.test(ausbildungValue)) {
          newFields[AUSBILDUNG_FIELD] = ausbildungValue
        }

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
