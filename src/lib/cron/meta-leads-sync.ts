// Meta-Leads-Sync: holt neue Leads aus Metas Lead-Ads-Formularen (direkt über die Graph
// API, ohne Umweg über Leadtable) für jede Kampagne mit hinterlegter meta_form_id und
// legt daraus neue Kandidaten an. Bewusst unabhängig vom Leadtable-Sync, da beide
// Quellen unabhängig laufen sollen.
//
// Aus scripts/meta-leads-sync.ts ausgelagert (02.10.2026), damit dieselbe Logik sowohl
// vom Cloudflare Cron Trigger (custom-worker.ts -> /api/cron/meta-leads-sync, alle 30
// Minuten) als auch weiterhin manuell per CLI läuft. Ergänzt den Echtzeit-Webhook
// (src/app/api/webhooks/meta-leadgen/route.ts) als Netz für verpasste Events.
//
// Dublettenschutz: zuerst per meta_lead_id (exakte Wiederholungs-Erkennung bei erneuten
// Läufen), dann per E-Mail gegen ALLE bestehenden Kandidaten - findet ein Lead per E-Mail
// einen bereits von Leadtable importierten Kandidaten, wird KEIN zweiter Kandidat
// angelegt, sondern nur die meta_lead_id an den bestehenden Datensatz angehängt.
//
// Zusatzfelder: nutzt dieselbe KI-Extraktion wie der Leadtable-Sync
// (extractCustomFieldsFromDescriptionAI aus leadtable-sync-shared.ts), gefüttert mit
// Metas rohen Formular-Antworten.

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { fetchMetaLeadsForForm, buildFormToPageAccessTokenMap, type MetaLead } from "@/lib/meta-ads-client"
import { processMetaLead } from "@/lib/meta-leads-sync-shared"

type Supabase = SupabaseClient<Database>

const ARCHIVED_STATUS = "Archiviert"
const DELAY_MS = 250

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface CampaignRow {
  id: string
  title: string
  status: string
  client_id: string | null
  agency_id: string | null
  meta_form_id: string | null
}

export interface MetaLeadsSyncResult {
  campaignsProcessed: number
  created: number
  linkedExisting: number
  skippedNoEmail: number
  errors: { campaignId: string; leadId: string; message: string }[]
}

async function loadCampaigns(
  supabase: Supabase,
  campaignId: string | null,
  includeInactiveLeadCampaigns: boolean
): Promise<CampaignRow[]> {
  let query = supabase
    .from("campaigns")
    .select("id, title, status, kind, client_id, agency_id, meta_form_id")
    .not("meta_form_id", "is", null)
    // Lead-Kampagnen zuerst ("lead" < "kanzlei"), siehe Formular-Dedup in syncMetaLeads.
    .order("kind", { ascending: true })

  if (campaignId) query = query.eq("id", campaignId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Importierte Meta-Lead-Kampagnen (T-38) regulär nur, solange sie laufen - die
  // Altbestände pausierter/beendeter Kampagnen holt man einmalig per
  // "npx tsx scripts/meta-leads-sync.ts --alle".
  return (data ?? []).filter(
    (c) =>
      c.status !== ARCHIVED_STATUS &&
      (c.kind !== "lead" || c.status === "active" || includeInactiveLeadCampaigns || campaignId !== null)
  )
}

// limit: max. Leads pro Formular (kleiner Testlauf), campaignId: nur diese Kampagne.
export async function syncMetaLeads(
  supabase: Supabase,
  {
    limit = null,
    campaignId = null,
    includeInactiveLeadCampaigns = false,
    log = console.log,
  }: {
    limit?: number | null
    campaignId?: string | null
    includeInactiveLeadCampaigns?: boolean
    log?: (message: string) => void
  } = {}
): Promise<MetaLeadsSyncResult> {
  const result: MetaLeadsSyncResult = {
    campaignsProcessed: 0,
    created: 0,
    linkedExisting: 0,
    skippedNoEmail: 0,
    errors: [],
  }

  const campaigns = await loadCampaigns(supabase, campaignId, includeInactiveLeadCampaigns)
  log(`${campaigns.length} Kampagne(n) mit Meta-Formular gefunden.`)

  // Seitengebundene Endpunkte (leads) verlangen zwingend den Page-Access-Token DIESER
  // Seite statt des System-User-Tokens (siehe metaGraphFetch-Kommentar) - daher einmal
  // pro Lauf die Formular-ID -> Seiten-Token-Zuordnung aufbauen, statt pro Kampagne
  // erneut alle Seiten abzufragen.
  const formToPageToken = await buildFormToPageAccessTokenMap()

  // Hängt dasselbe Formular an mehreren Kampagnen (alte Kanzlei-Kampagne + importierte
  // Lead-Kampagne, T-38), nur einmal verarbeiten - über die zuerst geladene (Lead-)Kampagne.
  const processedFormIds = new Set<string>()

  for (const campaign of campaigns) {
    if (processedFormIds.has(campaign.meta_form_id!)) {
      log(`\n→ Kampagne "${campaign.title}": Formular ${campaign.meta_form_id} bereits über eine andere Kampagne verarbeitet, übersprungen.`)
      continue
    }
    processedFormIds.add(campaign.meta_form_id!)
    log(`\n→ Kampagne "${campaign.title}" (Formular ${campaign.meta_form_id})`)
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
    log(`  ${leads.length} Lead(s) von Meta geladen.`)

    for (const lead of leads) {
      let alreadyKnown = false
      try {
        const outcome = await processMetaLead(supabase, campaign, lead)
        alreadyKnown = outcome.status === "already_known"
        if (outcome.status === "created") result.created++
        else if (outcome.status === "linked_existing") result.linkedExisting++
        else if (outcome.status === "skipped_no_email") result.skippedNoEmail++
        // "already_known" (per meta_lead_id) zählt bewusst nicht extra mit.
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(`  Fehler bei Lead ${lead.id}: ${message}`)
        result.errors.push({ campaignId: campaign.id, leadId: lead.id, message })
      }
      // Pause nur nach echter Verarbeitung (Anlage, KI-Extraktion) - bereits bekannte
      // Leads kosten keine weiteren API-Aufrufe.
      if (!alreadyKnown) await sleep(DELAY_MS)
    }

    result.campaignsProcessed++
  }

  return result
}
