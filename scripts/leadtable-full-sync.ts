// Kombinierter Leadtable-Sync: führt in einem Lauf alle 4 bisher separaten Bausteine
// aus und protokolliert Start/Ende/Ergebnis in leadtable_sync_runs. Grundlage für einen
// künftigen automatischen (z.B. per Cron) Sync mit Live-Status-Anzeige im Dashboard.
//
// Schritte:
//   1. Neue Kandidaten importieren (nur Kunden mit archived: false ODER "Kanzleistelle24.de",
//      nur neue Leads, Duplikat-Schutz per E-Mail wie in src/lib/leadtable-import.ts)
//   2. Status-Sync für alle bestehenden Leadtable-Kandidaten (wie leadtable-status-sync.ts)
//   3. Beschreibungs-Import für Kandidaten ohne description (wie leadtable-description-import.ts)
//   4. Zusatzfelder-Backfill für Kandidaten ohne custom_fields (wie leadtable-backfill-fields.ts)
//
// Bekannte Einschränkung (geerbt von importLeadtableCustomer): Für bereits bekannte
// Kunden (leadtable_customer_id schon in clients vorhanden) werden keine automatisch
// NEUEN Kampagnen dieses Kunden in unsere campaigns-Tabelle nachgetragen - Leads aus
// solchen neuen Kampagnen werden trotzdem importiert, aber ohne campaign_id/client_id-
// Verknüpfung (wie beim ursprünglichen, ungefilterten Bulk-Import).
//
// Usage:
//   npx tsx scripts/leadtable-full-sync.ts                                    (voller Lauf)
//   npx tsx scripts/leadtable-full-sync.ts --customerLimit=3 --limit=5        (kleiner Testlauf)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database, Json } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { importLeadtableCustomer } from "../src/lib/leadtable-import-customers"
import { importLeadtableCampaign } from "../src/lib/leadtable-import"
import {
  type LeadtableSyncLead,
  sleep,
  withRetry,
  mapLeadtableStatus,
  htmlDescriptionToPlainText,
  extractLeadtableCustomFields,
  extractCustomFieldsFromDescriptionAI,
} from "../src/lib/leadtable-sync-shared"
import { FIXED_CUSTOM_FIELDS } from "../src/lib/candidate-custom-fields"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

type SupabaseClient = ReturnType<typeof createClient<Database>>

const DELAY_MS = 250
const PROGRESS_EVERY = 30
const KEEP_EVEN_IF_ARCHIVED_NAME = "Kanzleistelle24.de"

function parseArgs(): { customerLimit: number | null; limit: number | null } {
  function parseIntArg(name: string): number | null {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`))
    if (!arg) return null
    const value = Number(arg.split("=")[1])
    return Number.isFinite(value) && value > 0 ? value : null
  }
  return { customerLimit: parseIntArg("customerLimit"), limit: parseIntArg("limit") }
}

// ── Schritt 1: Neue Kandidaten ──────────────────────────────────────────────

interface LeadtablePagination {
  totalItems: number
  totalPages: number
  currentPage: number
  itemsPerPage: number
}
interface LeadtableCustomer {
  _id: string
  name: string
  archived?: boolean
}
interface LeadtableCampaignListItem {
  _id: string
  occupation?: string
}

async function fetchAllCustomers(): Promise<LeadtableCustomer[]> {
  const firstPage = await leadtableFetch<{ pagination: LeadtablePagination; customers: LeadtableCustomer[] }>(
    "/customer/all",
    { page: 1, limit: 100 }
  )
  const customers = [...firstPage.customers]
  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    await sleep(DELAY_MS)
    const nextPage = await leadtableFetch<{ pagination: LeadtablePagination; customers: LeadtableCustomer[] }>(
      "/customer/all",
      { page, limit: 100 }
    )
    customers.push(...nextPage.customers)
  }
  return customers
}

async function fetchAllCampaignsForCustomer(customerId: string): Promise<LeadtableCampaignListItem[]> {
  const firstPage = await leadtableFetch<{ pagination: LeadtablePagination; campaigns: LeadtableCampaignListItem[] }>(
    `/campaign/all/${customerId}`,
    { page: 1, limit: 100 }
  )
  const campaigns = [...firstPage.campaigns]
  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    await sleep(DELAY_MS)
    const nextPage = await leadtableFetch<{ pagination: LeadtablePagination; campaigns: LeadtableCampaignListItem[] }>(
      `/campaign/all/${customerId}`,
      { page, limit: 100 }
    )
    campaigns.push(...nextPage.campaigns)
  }
  return campaigns
}

async function importNewCandidates(
  supabase: SupabaseClient,
  customerLimit: number | null
): Promise<{ newCandidates: number; errors: number }> {
  console.log("Kunden von Leadtable laden ...")
  const allCustomers = await fetchAllCustomers()
  const relevantCustomers = allCustomers.filter(
    (c) => c.archived === false || c.name === KEEP_EVEN_IF_ARCHIVED_NAME
  )
  const customers = customerLimit ? relevantCustomers.slice(0, customerLimit) : relevantCustomers
  console.log(
    `${allCustomers.length} Kunden gesamt, ${relevantCustomers.length} relevant (archived: false ODER "${KEEP_EVEN_IF_ARCHIVED_NAME}")` +
      (customerLimit ? `, Test-Limit: ${customers.length}` : "")
  )

  let newCandidates = 0
  let errors = 0

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i]

    try {
      await sleep(DELAY_MS)
      await withRetry(() => importLeadtableCustomer(customer._id, customer.name))
    } catch (err) {
      console.log(`  Kunde "${customer.name}": FEHLER bei Kunden-Registrierung - ${err instanceof Error ? err.message : err}`)
      errors++
      continue
    }

    let campaigns: LeadtableCampaignListItem[]
    try {
      await sleep(DELAY_MS)
      campaigns = await withRetry(() => fetchAllCampaignsForCustomer(customer._id))
    } catch (err) {
      console.log(`  Kunde "${customer.name}": FEHLER beim Laden der Kampagnen - ${err instanceof Error ? err.message : err}`)
      errors++
      continue
    }

    for (const campaign of campaigns) {
      const campaignName = campaign.occupation ?? "(ohne Namen)"
      try {
        await sleep(DELAY_MS)

        const { data: campaignRecord } = await supabase
          .from("campaigns")
          .select("id")
          .eq("leadtable_campaign_id", campaign._id)
          .maybeSingle()

        const result = await withRetry(() =>
          importLeadtableCampaign(customer._id, campaign._id, campaignName, campaignRecord?.id)
        )
        newCandidates += result.created
        errors += result.errors.length
      } catch (err) {
        console.log(
          `  Kunde "${customer.name}", Kampagne "${campaignName}": FEHLER - ${err instanceof Error ? err.message : err}`
        )
        errors++
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === customers.length - 1) {
      console.log(`  [${i + 1}/${customers.length}] Kunden verarbeitet, neue Kandidaten bisher: ${newCandidates}`)
    }
  }

  return { newCandidates, errors }
}

// ── Schritt 2: Status-Sync ──────────────────────────────────────────────────

async function syncStatuses(
  supabase: SupabaseClient,
  limit: number | null
): Promise<{ statusUpdated: number; errors: number }> {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, status, email, leadtable_lead_id")
    .eq("source", "leadtable")
    .not("email", "is", null)

  if (error) throw new Error(error.message)

  let list = candidates ?? []
  if (limit) list = list.slice(0, limit)
  console.log(`${list.length} Kandidaten für Status-Sync` + (limit ? ` (Test-Limit)` : ""))

  let statusUpdated = 0
  let errors = 0

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const email = (candidate.email ?? "").trim().split(/\s+/)[0]

    try {
      await sleep(DELAY_MS)

      let lead: LeadtableSyncLead | undefined
      let newLeadId: string | null = null

      if (candidate.leadtable_lead_id) {
        const resp = await withRetry(() =>
          leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${candidate.leadtable_lead_id}`)
        )
        lead = resp.lead
      } else {
        const resp = await withRetry(() =>
          leadtableFetch<{ leads: LeadtableSyncLead[] }>(`/searchLeadByMail/${encodeURIComponent(email)}`)
        )
        lead = resp.leads[0]
        if (lead) newLeadId = lead._id
      }

      if (!lead) continue // nicht gefunden, kein Fehler (siehe leadtable-status-sync.ts)

      const mappedStatus = mapLeadtableStatus(lead)
      if (!mappedStatus) continue // unbekannter Status, kein Fehler, Status bleibt unverändert

      const { error: statusError } = await supabase
        .from("candidates")
        .update({ status: mappedStatus })
        .eq("id", candidate.id)
      if (statusError) throw new Error(statusError.message)

      if (newLeadId) {
        const { error: leadIdError } = await supabase
          .from("candidates")
          .update({ leadtable_lead_id: newLeadId })
          .eq("id", candidate.id)
        if (leadIdError && !leadIdError.message.includes("duplicate key")) {
          throw new Error(leadIdError.message)
        }
      }

      if (mappedStatus !== candidate.status) statusUpdated++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes("404")) errors++
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(`  [${i + 1}/${list.length}] Status aktualisiert bisher: ${statusUpdated}, Fehler: ${errors}`)
    }
  }

  return { statusUpdated, errors }
}

// ── Schritt 3: Beschreibungs-Import (nur wo description noch leer ist) ─────

async function importDescriptions(
  supabase: SupabaseClient,
  limit: number | null
): Promise<{ descriptionsAdded: number; errors: number }> {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, leadtable_lead_id")
    .eq("source", "leadtable")
    .is("description", null)
    .not("leadtable_lead_id", "is", null)

  if (error) throw new Error(error.message)

  let list = candidates ?? []
  if (limit) list = list.slice(0, limit)
  console.log(`${list.length} Kandidaten ohne description` + (limit ? ` (Test-Limit)` : ""))

  let descriptionsAdded = 0
  let errors = 0

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]

    try {
      await sleep(DELAY_MS)
      const resp = await withRetry(() =>
        leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${candidate.leadtable_lead_id}`)
      )
      const rawHtml = resp.lead.description?.trim() ?? ""
      if (rawHtml === "") continue

      const description = htmlDescriptionToPlainText(rawHtml)
      if (description === "") continue

      const { error: updateError } = await supabase
        .from("candidates")
        .update({ description })
        .eq("id", candidate.id)
      if (updateError) throw new Error(updateError.message)

      descriptionsAdded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes("404")) errors++
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(`  [${i + 1}/${list.length}] Beschreibungen ergänzt bisher: ${descriptionsAdded}, Fehler: ${errors}`)
    }
  }

  return { descriptionsAdded, errors }
}

// ── Schritt 4: Zusatzfelder-Backfill (nur wo custom_fields noch leer ist) ──

async function backfillCustomFields(
  supabase: SupabaseClient,
  limit: number | null
): Promise<{ fieldsAdded: number; errors: number }> {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, email")
    .eq("source", "leadtable")
    .is("custom_fields", null)
    .not("email", "is", null)

  if (error) throw new Error(error.message)

  let list = candidates ?? []
  if (limit) list = list.slice(0, limit)
  console.log(`${list.length} Kandidaten ohne custom_fields` + (limit ? ` (Test-Limit)` : ""))

  let fieldsAdded = 0
  let errors = 0

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const email = (candidate.email ?? "").trim().split(/\s+/)[0]

    try {
      await sleep(DELAY_MS)
      const resp = await withRetry(() =>
        leadtableFetch<{ leads: LeadtableSyncLead[] }>(`/searchLeadByMail/${encodeURIComponent(email)}`)
      )
      const lead = resp.leads[0]
      if (!lead) continue

      const newFields = extractLeadtableCustomFields(lead.modifiedData)
      if (Object.keys(newFields).length === 0) continue

      const { error: updateError } = await supabase
        .from("candidates")
        .update({ custom_fields: newFields as Json })
        .eq("id", candidate.id)
      if (updateError) throw new Error(updateError.message)

      fieldsAdded++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes("404")) errors++
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(`  [${i + 1}/${list.length}] Zusatzfelder ergänzt bisher: ${fieldsAdded}, Fehler: ${errors}`)
    }
  }

  return { fieldsAdded, errors }
}

// ── Schritt 4 (Fortsetzung): KI-gestützte Extraktion aus der Beschreibung ──────
// Läuft nach dem regelbasierten Backfill oben, deckt aber einen breiteren Kreis ab:
// nicht nur Kandidaten mit komplett leerem custom_fields, sondern alle mit einer
// description, bei denen noch mindestens eines der 12 bekannten Felder fehlt (auch
// wenn custom_fields bereits teilweise befüllt ist, z.B. durch den Regex-Backfill oben
// oder manuelle UI-Eingaben). Überschreibt nie bestehende Werte - siehe
// extractCustomFieldsFromDescriptionAI in leadtable-sync-shared.ts.
async function backfillCustomFieldsWithAI(
  supabase: SupabaseClient,
  limit: number | null
): Promise<{ fieldsAdded: number; candidatesUpdated: number; errors: number }> {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, description, custom_fields")
    .eq("source", "leadtable")
    .not("description", "is", null)

  if (error) throw new Error(error.message)

  const withGaps = (candidates ?? []).filter((c) => {
    if ((c.description ?? "").trim() === "") return false
    const existing = (c.custom_fields as Record<string, string> | null) ?? {}
    return FIXED_CUSTOM_FIELDS.some(
      (f) => !(typeof existing[f.key] === "string" && existing[f.key].trim() !== "")
    )
  })

  let list = withGaps
  if (limit) list = list.slice(0, limit)
  console.log(
    `${list.length} Kandidaten mit description und noch fehlenden Zusatzfeldern` + (limit ? ` (Test-Limit)` : "")
  )

  let fieldsAdded = 0
  let candidatesUpdated = 0
  let errors = 0

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const existing = (candidate.custom_fields as Record<string, string> | null) ?? {}

    try {
      await sleep(DELAY_MS)
      const newFields = await extractCustomFieldsFromDescriptionAI(candidate.description, existing)
      if (Object.keys(newFields).length === 0) continue

      // existing gewinnt bei Konflikt (bereits durch extractCustomFieldsFromDescriptionAI
      // gefiltert, hier zusätzlich als Sicherheitsnetz - gleiches Muster wie beim
      // regelbasierten Backfill/Merge an anderer Stelle).
      const merged = { ...newFields, ...existing }
      const { error: updateError } = await supabase
        .from("candidates")
        .update({ custom_fields: merged as Json })
        .eq("id", candidate.id)
      if (updateError) throw new Error(updateError.message)

      fieldsAdded += Object.keys(newFields).length
      candidatesUpdated++
    } catch (err) {
      errors++
      console.error(`  Fehler bei Kandidat ${candidate.id}:`, err instanceof Error ? err.message : err)
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `  [${i + 1}/${list.length}] KI-Felder ergänzt bisher: ${fieldsAdded} (${candidatesUpdated} Kandidaten), Fehler: ${errors}`
      )
    }
  }

  return { fieldsAdded, candidatesUpdated, errors }
}

// ── main ──────────────────────────────────────────────────────────────────

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { customerLimit, limit } = parseArgs()
  const startedAt = Date.now()

  const { data: run, error: runInsertError } = await supabase
    .from("leadtable_sync_runs")
    .insert({ status: "running" })
    .select("id")
    .single()

  if (runInsertError || !run) {
    throw new Error(`Konnte keinen leadtable_sync_runs-Eintrag anlegen: ${runInsertError?.message}`)
  }
  const runId = run.id

  console.log(`=== Leadtable Full-Sync gestartet (run id: ${runId}) ===`)
  if (customerLimit) console.log(`Test-Limit Kunden (Schritt 1): ${customerLimit}`)
  if (limit) console.log(`Test-Limit pro Kandidat-Schritt (2-4): ${limit}`)
  console.log("")

  try {
    console.log("--- Schritt 1/4: Neue Kandidaten importieren ---")
    const stepA = await importNewCandidates(supabase, customerLimit)
    console.log(`=> Neue Kandidaten: ${stepA.newCandidates}, Fehler: ${stepA.errors}`)
    console.log("")

    console.log("--- Schritt 2/4: Status-Sync ---")
    const stepB = await syncStatuses(supabase, limit)
    console.log(`=> Status aktualisiert: ${stepB.statusUpdated}, Fehler: ${stepB.errors}`)
    console.log("")

    console.log("--- Schritt 3/4: Beschreibungs-Import ---")
    const stepC = await importDescriptions(supabase, limit)
    console.log(`=> Beschreibungen ergänzt: ${stepC.descriptionsAdded}, Fehler: ${stepC.errors}`)
    console.log("")

    console.log("--- Schritt 4/4: Zusatzfelder-Backfill ---")
    const stepD = await backfillCustomFields(supabase, limit)
    console.log(`=> Zusatzfelder ergänzt: ${stepD.fieldsAdded}, Fehler: ${stepD.errors}`)
    console.log("")

    console.log("--- Schritt 4/4 (Fortsetzung): KI-Extraktion aus Beschreibung ---")
    const stepD2 = await backfillCustomFieldsWithAI(supabase, limit)
    console.log(
      `=> KI-Zusatzfelder ergänzt: ${stepD2.fieldsAdded} (${stepD2.candidatesUpdated} Kandidaten), Fehler: ${stepD2.errors}`
    )
    console.log("")

    const summary = {
      newCandidates: stepA.newCandidates,
      statusUpdated: stepB.statusUpdated,
      descriptionsAdded: stepC.descriptionsAdded,
      fieldsAdded: stepD.fieldsAdded,
      aiFieldsAdded: stepD2.fieldsAdded,
      errors: stepA.errors + stepB.errors + stepC.errors + stepD.errors + stepD2.errors,
    }

    const { error: finishError } = await supabase
      .from("leadtable_sync_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        summary: summary as Json,
      })
      .eq("id", runId)

    if (finishError) throw new Error(`Lauf war erfolgreich, konnte aber nicht als 'success' protokolliert werden: ${finishError.message}`)

    const durationSec = (Date.now() - startedAt) / 1000
    console.log("=== Gesamtsumme ===")
    console.log(JSON.stringify(summary, null, 2))
    console.log("")
    console.log(`Dauer: ${durationSec.toFixed(1)}s`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("")
    console.error("FATALER FEHLER, Lauf abgebrochen:", message)

    await supabase
      .from("leadtable_sync_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error_message: message,
      })
      .eq("id", runId)

    process.exit(1)
  }
}

main().catch((err) => {
  console.error("FATALER FEHLER außerhalb der Run-Protokollierung:", err instanceof Error ? err.message : err)
  process.exit(1)
})
