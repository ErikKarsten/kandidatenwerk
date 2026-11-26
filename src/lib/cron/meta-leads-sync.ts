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
import { extractMetaContactFields, fetchMetaLeadsForForm, fetchFormDirectory, type MetaFormInfo, type MetaLead } from "@/lib/meta-ads-client"
import { processMetaLead } from "@/lib/meta-leads-sync-shared"
import { kampagneFuerLead, offeneFormulareMelden, type OffenesFormular } from "@/lib/lead-zuordnung"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"

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
  kind: string
  // Formular, dessen Leads schon einmal vollständig geholt wurden (Paket 109).
  meta_form_nachgeholt?: string | null
}

// Neu hinterlegte Formulare: beim ersten Lauf alle Leads holen, nicht nur die letzten Tage
// (Paket 109, ETL Rubikon: Formular am 09.11. hinterlegt, Leads vom 05./06.11. - der Webhook
// fand damals keine Kampagne, der Abgleich sah nur 3 Tage zurück, die Leads kamen nie an).
// Höchstens so viele pro Lauf, wegen Cloudflares Limit von 1000 Unteranfragen.
const NACHHOLEN_PRO_LAUF = 2

export interface MetaLeadsSyncResult {
  campaignsProcessed: number
  created: number
  linkedExisting: number
  skippedNoEmail: number
  errors: { campaignId: string; leadId: string; message: string }[]
  // Hinweise, die den Lauf nicht scheitern lassen (T-65): z.B. Formular, dessen
  // Facebook-Seite dem Meta-Systemnutzer nicht freigegeben ist - das ist eine
  // Einrichtungsfrage im Business Manager, kein Fehler, der jede halbe Stunde eine
  // Warn-Mail auslösen soll.
  warnings: { campaignId: string; campaignTitle: string; message: string }[]
  // Formulare ohne verknüpfte Kampagne (Paket 116): geprüft, Leads darüber zugeordnet,
  // Formulare mit Leads, die sich keiner Kampagne zuordnen ließen.
  ohneKampagne: { formulareGeprueft: number; zugeordnet: number; offeneFormulare: number }
}

async function loadCampaigns(
  supabase: Supabase,
  campaignId: string | null,
  includeInactiveLeadCampaigns: boolean
): Promise<CampaignRow[]> {
  // meta_form_nachgeholt ist noch nicht in src/types/database.ts generiert.
  let query = (supabase as unknown as SupabaseClient)
    .from("campaigns")
    .select("id, title, status, kind, client_id, agency_id, meta_form_id, meta_form_nachgeholt")
    .not("meta_form_id", "is", null)
    // Lead-Kampagnen zuerst ("lead" < "kanzlei"), siehe Formular-Dedup in syncMetaLeads.
    .order("kind", { ascending: true })

  if (campaignId) query = query.eq("id", campaignId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  // Importierte Meta-Lead-Kampagnen (T-38) regulär nur, solange sie laufen - die
  // Altbestände pausierter/beendeter Kampagnen holt man einmalig per
  // "npx tsx scripts/meta-leads-sync.ts --alle".
  return ((data ?? []) as CampaignRow[]).filter(
    (c) =>
      c.status !== ARCHIVED_STATUS &&
      (c.kind !== "lead" || c.status === "active" || includeInactiveLeadCampaigns || campaignId !== null) &&
      // Nur KS24-Kampagnen importieren (T-64).
      (c.kind !== "lead" || isKs24Campaign(c.title))
  )
}

// limit: max. Leads pro Formular (kleiner Testlauf), campaignId: nur diese Kampagne,
// sinceDays: nur Leads der letzten n Tage (Cron - sonst lädt jeder Lauf alle Leads aller
// Formulare und stößt an Cloudflares Limit von 1000 Unteranfragen je Lauf).
export async function syncMetaLeads(
  supabase: Supabase,
  {
    limit = null,
    campaignId = null,
    includeInactiveLeadCampaigns = false,
    sinceDays = null,
    ohneKampagne = null,
    log = console.log,
  }: {
    limit?: number | null
    campaignId?: string | null
    includeInactiveLeadCampaigns?: boolean
    sinceDays?: number | null
    // Formulare ohne Kampagne mitprüfen (Paket 116): nur die `scheibe`-te von `scheiben`
    // Teilmengen je Lauf, wegen Metas Anfrage-Grenzen und Cloudflares 1000 Unteranfragen.
    ohneKampagne?: { scheiben: number; scheibe: number } | null
    log?: (message: string) => void
  } = {}
): Promise<MetaLeadsSyncResult> {
  const result: MetaLeadsSyncResult = {
    campaignsProcessed: 0,
    created: 0,
    linkedExisting: 0,
    skippedNoEmail: 0,
    errors: [],
    warnings: [],
    ohneKampagne: { formulareGeprueft: 0, zugeordnet: 0, offeneFormulare: 0 },
  }

  const campaigns = await loadCampaigns(supabase, campaignId, includeInactiveLeadCampaigns)
  log(`${campaigns.length} Kampagne(n) mit Meta-Formular gefunden.`)

  // Seitengebundene Endpunkte (leads) verlangen zwingend den Page-Access-Token DIESER
  // Seite statt des System-User-Tokens (siehe metaGraphFetch-Kommentar) - daher einmal
  // pro Lauf die Formular-ID -> Seiten-Token-Zuordnung aufbauen, statt pro Kampagne
  // erneut alle Seiten abzufragen.
  const verzeichnis = await fetchFormDirectory()
  const formToPageToken = new Map([...verzeichnis].map(([id, f]) => [id, f.accessToken]))

  // Hängt dasselbe Formular an mehreren Kampagnen (alte Kanzlei-Kampagne + importierte
  // Lead-Kampagne, T-38), nur einmal verarbeiten - über die zuerst geladene (Lead-)Kampagne.
  const processedFormIds = new Set<string>()
  let nachgeholt = 0

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
      log(`  Hinweis: ${message}`)
      result.warnings.push({ campaignId: campaign.id, campaignTitle: campaign.title, message: "Facebook-Seite des Formulars ist dem Meta-Systemnutzer nicht freigegeben." })
      continue
    }
    const nachholen = campaign.meta_form_nachgeholt !== campaign.meta_form_id && nachgeholt < NACHHOLEN_PRO_LAUF
    if (nachholen) {
      nachgeholt++
      log(`  Formular neu hinterlegt: alle Leads werden einmal vollständig geholt.`)
    }
    let leads: MetaLead[]
    try {
      const sinceUnix = sinceDays && !nachholen ? Math.floor(Date.now() / 1000) - sinceDays * 86400 : undefined
      leads = await fetchMetaLeadsForForm(campaign.meta_form_id!, sinceUnix ? { sinceUnix } : undefined, pageAccessToken)
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
    // Vollständig geholt und ohne Fehler: ab jetzt reichen die letzten Tage.
    if (campaign.meta_form_nachgeholt !== campaign.meta_form_id && !result.errors.some((e) => e.campaignId === campaign.id) && (nachholen || !sinceDays)) {
      const { error: markError } = await (supabase as unknown as SupabaseClient)
        .from("campaigns")
        .update({ meta_form_nachgeholt: campaign.meta_form_id })
        .eq("id", campaign.id)
      if (markError) log(`  Hinweis: Nachholen nicht vermerkt (${markError.message})`)
    }
  }

  if (ohneKampagne && !campaignId) await formulareOhneKampagne(supabase, verzeichnis, ohneKampagne, sinceDays ?? 3, result, log)

  return result
}

// Formulare, die an keiner Kampagne hängen: Leads der letzten Tage über Meta-Kampagne bzw.
// Kanzlei der Seite zuordnen (lead-zuordnung.ts), den Rest für die rote Leiste melden.
async function formulareOhneKampagne(
  supabase: Supabase,
  verzeichnis: Map<string, MetaFormInfo>,
  { scheiben, scheibe }: { scheiben: number; scheibe: number },
  tage: number,
  result: MetaLeadsSyncResult,
  log: (message: string) => void
) {
  const { data: verknuepft } = await supabase.from("campaigns").select("meta_form_id").not("meta_form_id", "is", null)
  const verknuepftIds = new Set((verknuepft ?? []).map((r) => r.meta_form_id as string))
  const formIdsJeSeite = new Map<string, string[]>()
  for (const [id, f] of verzeichnis) formIdsJeSeite.set(f.pageId, [...(formIdsJeSeite.get(f.pageId) ?? []), id])

  const kandidaten = [...verzeichnis]
    .filter(([id, f]) => !verknuepftIds.has(id) && (f.status ?? "ACTIVE") === "ACTIVE")
    .sort(([a], [b]) => a.localeCompare(b))
    .filter((_, i) => i % scheiben === scheibe % scheiben)
  log(`\n→ Formulare ohne Kampagne: ${kandidaten.length} in diesem Lauf (Teil ${(scheibe % scheiben) + 1}/${scheiben}).`)

  const sinceUnix = Math.floor(Date.now() / 1000) - tage * 86400
  const offen: OffenesFormular[] = []
  const ohneOffene: string[] = []
  for (const [formId, form] of kandidaten) {
    result.ohneKampagne.formulareGeprueft++
    let leads: MetaLead[]
    try {
      leads = await fetchMetaLeadsForForm(formId, { sinceUnix }, form.accessToken)
    } catch (err) {
      log(`  Formular ${formId}: Leads nicht lesbar (${err instanceof Error ? err.message.slice(0, 120) : err})`)
      continue
    }
    if (leads.length) {
      const { data: bekannt } = await supabase.from("candidates").select("meta_lead_id").in("meta_lead_id", leads.map((l) => l.id))
      const bekannteIds = new Set((bekannt ?? []).map((r) => r.meta_lead_id))
      leads = leads.filter((l) => !bekannteIds.has(l.id))
    }
    let offeneLeads: MetaLead[] = []
    const seite = { name: form.pageName, formIds: formIdsJeSeite.get(form.pageId) ?? [] }
    for (const lead of leads) {
      try {
        const treffer = await kampagneFuerLead(supabase, { formId, formName: form.name, metaCampaignId: lead.campaign_id ?? null, seite })
        if (treffer === "ignoriert") continue
        if (!treffer) {
          offeneLeads.push(lead)
          continue
        }
        const outcome = await processMetaLead(supabase, treffer.kampagne, lead)
        if (outcome.status === "created") result.created++
        else if (outcome.status === "linked_existing") result.linkedExisting++
        else if (outcome.status === "skipped_no_email") result.skippedNoEmail++
        result.ohneKampagne.zugeordnet++
        log(`  Lead ${lead.id} („${form.name}“) → „${treffer.kampagne.title}“ (über ${treffer.weg}): ${outcome.status}`)
        await sleep(DELAY_MS)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push({ campaignId: "-", leadId: lead.id, message: `Formular ohne Kampagne ${formId}: ${message}` })
      }
    }
    offeneLeads = offeneLeads.filter((l) => !/dummy data for/i.test(JSON.stringify(l.field_data)))
    // Person schon in Kandidatenwerk (z. B. über eine andere Anzeige): kein Alarm.
    if (offeneLeads.length) {
      const mails = offeneLeads.map((l) => extractMetaContactFields(l.field_data).email?.trim().toLowerCase()).filter((m): m is string => !!m)
      const { data: vorhanden } = mails.length ? await supabase.from("candidates").select("email").in("email", mails) : { data: [] }
      const da = new Set((vorhanden ?? []).map((r) => r.email?.toLowerCase()))
      offeneLeads = offeneLeads.filter((l) => !da.has(extractMetaContactFields(l.field_data).email?.trim().toLowerCase() ?? ""))
    }
    if (offeneLeads.length) {
      offen.push({ formId, formName: form.name, pageName: form.pageName, leads: offeneLeads.length, letzterLead: offeneLeads.map((l) => l.created_time).sort().pop()! })
    } else ohneOffene.push(formId)
  }
  result.ohneKampagne.offeneFormulare = offen.length
  await offeneFormulareMelden(supabase as never, offen, ohneOffene)
}

