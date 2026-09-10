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
import type { Database, Json } from "../src/types/database"
import { fetchMetaLeadsForForm, extractMetaContactFields, type MetaLead } from "../src/lib/meta-ads-client"
import { extractCustomFieldsFromDescriptionAI } from "../src/lib/leadtable-sync-shared"
import { extractCleanName } from "../src/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

type SupabaseClient = ReturnType<typeof createClient<Database>>

const ARCHIVED_STATUS = "Archiviert"
const FALLBACK_CANDIDATE_STATUS = "neu"
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

async function processLead(
  supabase: SupabaseClient,
  campaign: CampaignRow,
  lead: MetaLead,
  result: SyncResult
): Promise<void> {
  // 1. Bereits per meta_lead_id bekannt (z.B. wiederholter Lauf) -> überspringen.
  const { data: existingByMetaId, error: metaIdLookupError } = await supabase
    .from("candidates")
    .select("id")
    .eq("meta_lead_id", lead.id)
    .maybeSingle()
  if (metaIdLookupError) throw new Error(metaIdLookupError.message)
  if (existingByMetaId) return

  const { name, email, phone, record } = extractMetaContactFields(lead.field_data)

  if (!email) {
    result.skippedNoEmail++
    return
  }

  // 2. Per E-Mail bekannt (z.B. schon von Leadtable importiert) -> keinen zweiten
  // Kandidaten anlegen, sondern nur die meta_lead_id nachtragen, damit künftige Läufe
  // diesen Lead direkt per ID erkennen statt jedes Mal erneut per E-Mail zu suchen.
  const { data: existingByEmail, error: emailLookupError } = await supabase
    .from("candidates")
    .select("id, meta_lead_id")
    .eq("email", email)
    .maybeSingle()
  if (emailLookupError) throw new Error(emailLookupError.message)

  if (existingByEmail) {
    if (!existingByEmail.meta_lead_id) {
      const { error: linkError } = await supabase
        .from("candidates")
        .update({ meta_lead_id: lead.id })
        .eq("id", existingByEmail.id)
      if (linkError) throw new Error(linkError.message)
    }
    result.linkedExisting++
    return
  }

  // 3. Neuer Kandidat: Name bereinigen (gleiche Heuristik wie beim Leadtable-Import),
  // Berufsbild aus dem Kampagnentitel ableiten, Zusatzfelder per KI aus den rohen
  // Meta-Formular-Antworten befüllen (record dient hier als modifiedData-Ersatz).
  const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(name ?? "")
  const berufsbild = mapKanzleistelleBerufsbild(campaign.title)

  const aiResult = await extractCustomFieldsFromDescriptionAI(null, record, {})
  if (aiResult.error) {
    console.warn(`  [KI-Warnung] Lead ${lead.id}: ${aiResult.error}`)
  }

  const notePrefix = usedLongNameHeuristic ? "[Automatisch bereinigter Name, bitte prüfen] " : ""

  const { error: insertError } = await supabase.from("candidates").insert({
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone ?? null,
    berufsbild,
    plz: null,
    status: FALLBACK_CANDIDATE_STATUS,
    source: "meta",
    campaign_id: campaign.id,
    client_id: campaign.client_id,
    meta_lead_id: lead.id,
    custom_fields: aiResult.fields as Json,
    notes: `${notePrefix}Import direkt aus Meta, Kampagne "${campaign.title}"`,
  })
  if (insertError) throw new Error(insertError.message)

  result.created++
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

  for (const campaign of campaigns) {
    console.log(`\n→ Kampagne "${campaign.title}" (Formular ${campaign.meta_form_id})`)
    let leads: MetaLead[]
    try {
      leads = await fetchMetaLeadsForForm(campaign.meta_form_id!)
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
