// EINMALIGER Nachlauf für die überarbeitete KI-Zusatzfelder-Extraktion (siehe
// extractCustomFieldsFromDescriptionAI in src/lib/leadtable-sync-shared.ts): die alte
// Version bekam nur die description (Freitext) zu sehen, nicht Leadtables modifiedData
// (die strukturierten Formular-Antworten) - bei Kampagnen, deren Formular andere
// Frage-IDs nutzt als die 4 fest codierten in LEADTABLE_CUSTOM_FIELD_MAP, blieben
// custom_fields dadurch leer, obwohl bei Leadtable reichlich Antworten vorlagen (siehe
// Diagnose Carina Krongart, 2026-08-06).
//
// Läuft bewusst über ALLE Leadtable-Kandidaten (nicht nur die mit leeren
// custom_fields) - auch wer bereits Felder über den alten Regex-/KI-Weg bekommen hat,
// kann jetzt zusätzliche Treffer aus modifiedData bekommen. Überschreibt wie immer
// NIE bestehende Werte (siehe extractCustomFieldsFromDescriptionAI) - reiner
// Lücken-Füller, auch für "weitere_antworten".
//
// Kostet einen echten Anthropic-API-Call pro Kandidat mit description und/oder
// modifiedData (~382 Leadtable-Kandidaten) - bewusst als einmaliger, separater Lauf
// und NICHT Teil des regulären leadtable-full-sync.ts, damit dessen künftige,
// inkrementelle Läufe nicht wiederholt für längst verarbeitete Kandidaten zahlen.
//
// Läuft als reines Node-Skript (nicht über den Cloudflare Worker), um dessen
// Subrequest-Limit zu umgehen (gleiches Muster wie die anderen scripts/leadtable-*.ts).
//
// Usage:
//   npx tsx scripts/leadtable-custom-fields-ai-resync.ts                (alle Kandidaten)
//   npx tsx scripts/leadtable-custom-fields-ai-resync.ts --limit=5      (Testlauf)
//   npx tsx scripts/leadtable-custom-fields-ai-resync.ts --id=<uuid>    (einzelnen Kandidaten nachziehen, z.B. nach einem transienten Fehler)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"
import {
  type LeadtableSyncLead,
  sleep,
  withRetry,
  extractCustomFieldsFromDescriptionAI,
  findLeadByEmailWithFallback,
} from "../src/lib/leadtable-sync-shared"
import { WEITERE_ANTWORTEN_KEY } from "../src/lib/candidate-custom-fields"

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

function parseIdArg(): string | null {
  const arg = process.argv.find((a) => a.startsWith("--id="))
  if (!arg) return null
  const value = arg.split("=")[1]?.trim()
  return value || null
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt (nicht in .env.local gefunden). " +
        "Ohne Key läuft die KI-Extraktion für jeden Kandidaten in einen Fehler - " +
        "Key ergänzen und erneut starten."
    )
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const limit = parseLimitArg()
  const onlyId = parseIdArg()
  const startedAt = Date.now()

  console.log("=== Alle Leadtable-Kandidaten laden ===")
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, description, custom_fields, leadtable_lead_id, campaign_id")
    .eq("source", "leadtable")

  if (error) throw new Error(error.message)

  let list = (candidates ?? []).filter((c) => c.leadtable_lead_id || c.email)
  console.log(`${list.length} Kandidaten mit leadtable_lead_id oder E-Mail geladen`)
  if (onlyId) {
    list = list.filter((c) => c.id === onlyId)
    console.log(`--id aktiv: nur Kandidat ${onlyId} (${list.length} gefunden)`)
  } else if (limit) {
    list = list.slice(0, limit)
    console.log(`Test-Limit aktiv: nur die ersten ${list.length} Kandidaten`)
  }
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
    candidatesUpdated: 0,
    fieldsAdded: 0,
    weitereAntwortenAdded: 0,
    skippedNoLead: 0,
    skippedNothingFound: 0,
    aiWarnings: 0,
    errors: 0,
  }
  const errorDetails: { name: string; id: string; message: string }[] = []

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const name = `${candidate.first_name} ${candidate.last_name}`
    const existing = (candidate.custom_fields as Record<string, string> | null) ?? {}

    try {
      await sleep(DELAY_MS)

      let lead: LeadtableSyncLead | undefined
      if (candidate.leadtable_lead_id) {
        const resp = await withRetry(() =>
          leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${candidate.leadtable_lead_id}`)
        )
        lead = resp.lead
      } else {
        const email = (candidate.email ?? "").trim().split(/\s+/)[0]
        const leadtableCampaignId = candidate.campaign_id
          ? (leadtableCampaignIdByCampaignId.get(candidate.campaign_id) ?? null)
          : null
        lead = email ? (await findLeadByEmailWithFallback(email, leadtableCampaignId)) ?? undefined : undefined
      }

      if (!lead) {
        totals.skippedNoLead++
        continue
      }

      const result = await extractCustomFieldsFromDescriptionAI(candidate.description, lead.modifiedData, existing)

      if (result.error) {
        totals.aiWarnings++
        errorDetails.push({ name, id: candidate.id, message: result.error })
      }

      if (Object.keys(result.fields).length === 0) {
        totals.skippedNothingFound++
        continue
      }

      const merged = { ...result.fields, ...existing }
      const { error: updateError } = await supabase
        .from("candidates")
        .update({ custom_fields: merged as Json })
        .eq("id", candidate.id)
      if (updateError) throw new Error(updateError.message)

      totals.candidatesUpdated++
      totals.fieldsAdded += Object.keys(result.fields).length
      if (result.fields[WEITERE_ANTWORTEN_KEY]) totals.weitereAntwortenAdded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("404")) {
        totals.skippedNoLead++
      } else {
        totals.errors++
        errorDetails.push({ name, id: candidate.id, message })
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] Zwischensumme: aktualisiert: ${totals.candidatesUpdated}, ` +
          `Felder ergänzt: ${totals.fieldsAdded} (davon weitere_antworten: ${totals.weitereAntwortenAdded}), ` +
          `nichts gefunden: ${totals.skippedNothingFound}, kein Lead: ${totals.skippedNoLead}, ` +
          `KI-Warnungen: ${totals.aiWarnings}, Fehler: ${totals.errors}`
      )
    }
  }

  const durationSec = (Date.now() - startedAt) / 1000

  if (errorDetails.length > 0) {
    console.log("")
    console.log("=== Fehler / KI-Warnungen (Details) ===")
    errorDetails.forEach((e) => console.log(`  ${e.name} [${e.id}]: ${e.message}`))
  }

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
