// Meta-Leads-Sync: holt neue Leads aus Metas Lead-Ads-Formularen (direkt über die Graph
// API, ohne Umweg über Leadtable) für jede Kampagne mit hinterlegter meta_form_id und
// legt daraus neue Kandidaten an. Bewusst als eigenständiges Skript (nicht in
// leadtable-full-sync.ts integriert), da beide Quellen unabhängig laufen sollen -
// insbesondere während der Parallelphase, in der Leadtable weiterhin dieselben Meta-
// Leads importiert.
//
// Dublettenschutz (wichtig während der Parallelphase): zuerst per meta_lead_id (exakte
// Wiederholungs-Erkennung bei erneuten Läufen), dann per E-Mail gegen ALLE bestehenden
// Kandidaten - findet ein Lead per E-Mail einen bereits von Leadtable importierten
// Kandidaten, wird KEIN zweiter Kandidat angelegt, sondern nur die meta_lead_id an den
// bestehenden Datensatz angehängt (verknüpft beide Quellen, ohne Duplikat).
//
// Zusatzfelder: nutzt dieselbe KI-Extraktion wie der Leadtable-Sync
// (extractCustomFieldsFromDescriptionAI aus leadtable-sync-shared.ts), gefüttert mit
// Metas rohen Formular-Antworten statt Leadtables modifiedData - damit Meta-Kandidaten
// in denselben 12 einheitlichen Feldern landen wie Leadtable-Kandidaten, statt unter
// rohen Facebook-Feldnamen in einem separaten Bereich.
//
// Usage:
//   npx tsx scripts/meta-leads-sync.ts                              (voller Lauf, alle Kampagnen mit meta_form_id)
//   npx tsx scripts/meta-leads-sync.ts --limit=5                    (kleiner Testlauf, max. 5 Leads pro Formular)
//   npx tsx scripts/meta-leads-sync.ts --campaignId=<uuid>          (nur eine bestimmte Kampagne)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { fetchMetaLeadsForForm, buildFormToPageAccessTokenMap, type MetaLead } from "../src/lib/meta-ads-client"
import { processMetaLead } from "../src/lib/meta-leads-sync-shared"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

type SupabaseClient = ReturnType<typeof createClient<Database>>

const ARCHIVED_STATUS = "Archiviert"
const DELAY_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseArgs(): { limit: number | null; campaignId: string | null } {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))
  const campaignIdArg = process.argv.find((a) => a.startsWith("--campaignId="))
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null
  return {
    limit: Number.isFinite(limit) && (limit ?? 0) > 0 ? limit : null,
    campaignId: campaignIdArg ? campaignIdArg.split("=")[1] : null,
  }
}

interface CampaignRow {
  id: string
  title: string
  status: string
  client_id: string | null
  meta_form_id: string | null
}

interface SyncResult {
  campaignsProcessed: number
  created: number
  linkedExisting: number
  skippedNoEmail: number
  errors: { campaignId: string; leadId: string; message: string }[]
}

async function loadCampaigns(supabase: SupabaseClient, campaignId: string | null): Promise<CampaignRow[]> {
  let query = supabase
    .from("campaigns")
    .select("id, title, status, client_id, meta_form_id")
    .not("meta_form_id", "is", null)

  if (campaignId) query = query.eq("id", campaignId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? []).filter((c) => c.status !== ARCHIVED_STATUS)
}

// Ruft die gemeinsame Verarbeitungslogik (siehe meta-leads-sync-shared.ts, auch vom
// Echtzeit-Webhook genutzt) auf und zählt das Ergebnis in die Lauf-Zusammenfassung ein.
async function processLead(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  lead: MetaLead,
  result: SyncResult
): Promise<void> {
  const outcome = await processMetaLead(supabase, campaign, lead)
  if (outcome.status === "created") result.created++
  else if (outcome.status === "linked_existing") result.linkedExisting++
  else if (outcome.status === "skipped_no_email") result.skippedNoEmail++
  // "already_known" (per meta_lead_id) zählt bewusst nicht extra mit - entspricht dem
  // bisherigen stillen "return" für diesen Fall.
}

async function main() {
  const { limit, campaignId } = parseArgs()

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const result: SyncResult = {
    campaignsProcessed: 0,
    created: 0,
    linkedExisting: 0,
    skippedNoEmail: 0,
    errors: [],
  }

  const campaigns = await loadCampaigns(supabase, campaignId)
  console.log(`${campaigns.length} Kampagne(n) mit Meta-Formular gefunden.`)

  // Seitengebundene Endpunkte (leads) verlangen zwingend den Page-Access-Token DIESER
  // Seite statt des System-User-Tokens (siehe metaGraphFetch-Kommentar) - daher einmal
  // pro Lauf die Formular-ID -> Seiten-Token-Zuordnung aufbauen, statt pro Kampagne
  // erneut alle Seiten abzufragen.
  const formToPageToken = await buildFormToPageAccessTokenMap()

  for (const campaign of campaigns) {
    console.log(`\n→ Kampagne "${campaign.title}" (Formular ${campaign.meta_form_id})`)
    const pageAccessToken = formToPageToken.get(campaign.meta_form_id!)
    if (!pageAccessToken) {
      const message = `Kein Page-Access-Token für Formular ${campaign.meta_form_id} gefunden (Formular gehört zu keiner dem System-User zugewiesenen Seite).`
      console.error(`  Fehler beim Laden der Leads: ${message}`)
      result.errors.push({ campaignId: campaign.id, leadId: "-", message })
      continue
    }
    let leads: MetaLead[]
    try {
      leads = await fetchMetaLeadsForForm(campaign.meta_form_id!, undefined, pageAccessToken)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`  Fehler beim Laden der Leads: ${message}`)
      result.errors.push({ campaignId: campaign.id, leadId: "-", message })
      continue
    }

    if (limit) leads = leads.slice(0, limit)
    console.log(`  ${leads.length} Lead(s) von Meta geladen.`)

    for (const lead of leads) {
      try {
        await processLead(supabase, campaign, lead, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  Fehler bei Lead ${lead.id}: ${message}`)
        result.errors.push({ campaignId: campaign.id, leadId: lead.id, message })
      }
      await sleep(DELAY_MS)
    }

    result.campaignsProcessed++
  }

  console.log("\n── Zusammenfassung ──────────────────────────")
  console.log(`Kampagnen verarbeitet: ${result.campaignsProcessed}`)
  console.log(`Neue Kandidaten:       ${result.created}`)
  console.log(`Mit Leadtable verknüpft (schon vorhanden per E-Mail): ${result.linkedExisting}`)
  console.log(`Übersprungen (keine E-Mail): ${result.skippedNoEmail}`)
  console.log(`Fehler:                ${result.errors.length}`)
  if (result.errors.length > 0) {
    for (const e of result.errors) {
      console.log(`  - Kampagne ${e.campaignId}, Lead ${e.leadId}: ${e.message}`)
    }
  }
}

main().catch((err) => {
  console.error("Meta-Leads-Sync fehlgeschlagen:", err)
  process.exit(1)
})
