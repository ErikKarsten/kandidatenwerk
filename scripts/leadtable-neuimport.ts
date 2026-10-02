// Kompletter Neustart der Kandidaten- und Kundendaten aus Leadtable (Atlas T-20,
// Entscheidungen vom 02.10.2026):
//
//   1. Sicherung aller betroffenen Tabellen nach backups/neuimport-<Zeitstempel>/ (JSON)
//   2. Löschen: ALLE Kandidaten (jeder Herkunft) samt Verlauf/Zuordnungen, ALLE Kunden
//      samt Kanzlei-Kampagnen, Kontakten und Kunden-Logins. Bleiben: Agentur, Team,
//      Meta-Lead-Kampagnen mit Werbegebieten, Vorlagen, Zusatzfelder, Protokolle.
//   3. Kunden: alle AKTIVEN Leadtable-Kunden (archived: false) mit ihren nicht
//      archivierten Leadtable-Kampagnen als Kanzlei-Kampagnen - ohne Logins. Von Hand
//      gepflegte Stammdaten (PLZ/Ort/Koordinaten, Kontakt, Logo, Kanzleistelle-ID) werden
//      per leadtable_customer_id / leadtable_campaign_id aus dem alten Stand übernommen.
//   4. Kandidaten: alle Leads ALLER Leadtable-Kunden (auch archivierter), eine Person je
//      E-Mail, OHNE Kunden-/Kampagnen-Zuordnung (Matching folgt danach) und ohne
//      Benachrichtigungs-Mails. Abgesagte Bewerbungen nicht. Formularantworten ->
//      Zusatzfelder, Wohnort-PLZ -> Standort, Rest + Leadtable-Notizen -> Beschreibung
//      (src/lib/leadtable-form-answers.ts).
//
// Danach ganz am Ende: Meta-Altleads (--alle).
//
// Läuft bewusst lokal (nicht im Worker) wegen Cloudflares Unteranfragen-Limit.
//
// Usage:
//   npx tsx scripts/leadtable-neuimport.ts                (Trockenlauf: zählt nur, ändert nichts)
//   npx tsx scripts/leadtable-neuimport.ts --ausfuehren   (Sicherung, Löschen, Import)
//   --cache: Leadtable-Daten aus backups/leadtable-cache.json statt neu laden (jeder Lauf
//            schreibt die Datei; spart die wegen Drosselung langsame Ladephase)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { fetchAllCustomers, fetchAllCampaigns, type LeadtableCampaign, type LeadtableCustomerListItem } from "../src/lib/leadtable-import-customers"
import { cleanLeadtableEmail, extractCleanName, isTestLead, type LeadtableLead } from "../src/lib/leadtable-import"
import {
  extractLeadtableCustomFields,
  htmlDescriptionToPlainText,
  LEADTABLE_STATUS_MAP,
  leadtableStatusName,
  sleep,
} from "../src/lib/leadtable-sync-shared"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"
import { getOrCreateLocationForPlz } from "../src/lib/location-clustering"
import { geocodePlz } from "../src/lib/geocode-plz"
import { mapLeadFormAnswers } from "../src/lib/leadtable-form-answers"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const DEFAULT_AGENCY_ID = "00000000-0000-0000-0000-000000000001"
const DELAY_MS = 300
const INSERT_CHUNK = 200
const REJECTED_STATUSES = new Set(["Absage", "Absage mit Mitteilung"])

type Db = SupabaseClient
type Row = Record<string, unknown>

// Leadtable drosselt bei vielen Anfragen minutenlang (429) - deutlich geduldiger als
// withRetry aus leadtable-sync-shared (dort max. ~40 s).
async function withRetry<T>(fn: () => Promise<T>, retries = 10): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes("429") || attempt >= retries) throw err
      console.log(`  Leadtable drosselt (429), warte ${attempt * 20} s…`)
      await sleep(attempt * 20000)
    }
  }
}

interface LeadWithContext {
  lead: LeadtableLead & {
    createdAt?: string
    deleted?: { state?: boolean }
    statusID?: { name?: string }
    modifiedData?: Record<string, unknown>
    funnelData?: { profile?: Record<string, { title?: string; value?: unknown }> }
  }
  customerName: string
  occupation: string
}

async function fetchAllRows(db: Db, table: string, apply?: (q: ReturnType<ReturnType<Db["from"]>["select"]>) => unknown): Promise<Row[]> {
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select("*").range(from, from + 999)
    if (apply) q = apply(q) as typeof q
    const { data, error } = await q
    if (error) throw new Error(`${table} lesen: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

async function fetchCampaignLeads(campaignId: string): Promise<LeadWithContext["lead"][]> {
  type Page = { pages?: { totalPages: number }; leads?: LeadWithContext["lead"][] }
  const first = await withRetry(() => leadtableFetch<Page>(`/lead/campaign/${campaignId}`, { page: 1, limit: 100 }))
  const leads = [...(first.leads ?? [])]
  for (let page = 2; page <= (first.pages?.totalPages ?? 1); page++) {
    await sleep(DELAY_MS)
    const next = await withRetry(() => leadtableFetch<Page>(`/lead/campaign/${campaignId}`, { page, limit: 100 }))
    leads.push(...(next.leads ?? []))
  }
  return leads
}

function fmtDate(iso: string | undefined): string {
  return iso ? new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "?"
}

async function main() {
  const execute = process.argv.includes("--ausfuehren")
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!) as unknown as Db
  console.log(execute ? "=== AUSFÜHRUNG: Sicherung, Löschen, Neuimport ===" : "=== TROCKENLAUF (ändert nichts) ===")

  // ── Leadtable laden (oder aus dem Zwischenspeicher) ──────────────────────
  const cachePath = path.resolve(__dirname, "../backups/leadtable-cache.json")
  type Cache = { loadedAt: string; customers: LeadtableCustomerListItem[]; campaigns: [string, LeadtableCampaign[]][]; leads: LeadWithContext[] }
  let customers: LeadtableCustomerListItem[]
  let campaignsByCustomer: Map<string, LeadtableCampaign[]>
  let leads: LeadWithContext[]
  if (process.argv.includes("--cache") && fs.existsSync(cachePath)) {
    const cache = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Cache
    console.log(`\nLeadtable-Daten aus Zwischenspeicher vom ${new Date(cache.loadedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}.`)
    customers = cache.customers
    campaignsByCustomer = new Map(cache.campaigns)
    leads = cache.leads
  } else {
    console.log("\nLade Leadtable-Kunden und -Kampagnen…")
    customers = await withRetry(() => fetchAllCustomers())
    campaignsByCustomer = new Map()
    for (const c of customers) {
      await sleep(DELAY_MS)
      campaignsByCustomer.set(c._id, await withRetry(() => fetchAllCampaigns(c._id)))
    }
    console.log("Lade alle Leads…")
    leads = []
    let done = 0
    const total = [...campaignsByCustomer.values()].flat().length
    for (const c of customers) {
      for (const camp of campaignsByCustomer.get(c._id) ?? []) {
        await sleep(DELAY_MS)
        for (const lead of await fetchCampaignLeads(camp._id)) {
          leads.push({ lead, customerName: c.name, occupation: camp.occupation ?? "" })
        }
        if (++done % 50 === 0) console.log(`  ${done}/${total} Kampagnen, ${leads.length} Leads`)
      }
    }
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    fs.writeFileSync(cachePath, JSON.stringify({ loadedAt: new Date().toISOString(), customers, campaigns: [...campaignsByCustomer], leads } satisfies Cache))
  }
  const activeCustomers = customers.filter((c) => c.archived === false)
  const allCampaigns = [...campaignsByCustomer.values()].flat()
  console.log(`${customers.length} Kunden (${activeCustomers.length} aktiv), ${allCampaigns.length} Kampagnen, ${leads.length} Leads.`)

  // ── Kandidaten bilden: eine Person je E-Mail, neueste Bewerbung führt ─────
  // Abgesagte Bewerbungen werden nicht übernommen (Entscheidung 02.10.2026); wer sich
  // daneben noch anderswo beworben hat, kommt über diese Bewerbung trotzdem rein.
  let skippedRejected = 0
  let skippedTest = 0
  let skippedNoEmail = 0
  let skippedDeleted = 0
  const byEmail = new Map<string, LeadWithContext[]>()
  for (const l of leads) {
    if (l.lead.deleted?.state === true) {
      skippedDeleted++
      continue
    }
    if (REJECTED_STATUSES.has(leadtableStatusName(l.lead))) {
      skippedRejected++
      continue
    }
    if (isTestLead(l.lead) || mapLeadFormAnswers(l.lead.funnelData?.profile).isTestLead) {
      skippedTest++
      continue
    }
    if (!l.lead.email) {
      skippedNoEmail++
      continue
    }
    const email = cleanLeadtableEmail(l.lead.email).toLowerCase()
    byEmail.set(email, [...(byEmail.get(email) ?? []), l])
  }

  // Leadtable-Notizen (Freitext des Teams) gibt es nur je Lead einzeln - zwischengespeichert.
  const notesCachePath = path.resolve(__dirname, "../backups/leadtable-notes-cache.json")
  const notesByLeadId: Record<string, string> = fs.existsSync(notesCachePath) ? JSON.parse(fs.readFileSync(notesCachePath, "utf8")) : {}
  const neededLeadIds = [...byEmail.values()].flat().map((a) => a.lead._id).filter((id) => !(id in notesByLeadId))
  if (neededLeadIds.length > 0) console.log(`\nLade Leadtable-Notizen für ${neededLeadIds.length} Bewerbungen…`)
  for (let n = 0; n < neededLeadIds.length; n++) {
    await sleep(DELAY_MS)
    const resp = await withRetry(() => leadtableFetch<{ lead?: { description?: string } }>(`/lead/${neededLeadIds[n]}`))
    const html = resp.lead?.description?.trim() ?? ""
    notesByLeadId[neededLeadIds[n]] = html ? htmlDescriptionToPlainText(html) : ""
    if ((n + 1) % 100 === 0) {
      console.log(`  ${n + 1}/${neededLeadIds.length}`)
      fs.writeFileSync(notesCachePath, JSON.stringify(notesByLeadId))
    }
  }
  fs.mkdirSync(path.dirname(notesCachePath), { recursive: true })
  fs.writeFileSync(notesCachePath, JSON.stringify(notesByLeadId))

  let withPlz = 0
  let withMetaLeadId = 0
  const candidateRows = [...byEmail.entries()].map(([email, apps]) => {
    apps.sort((a, b) => (b.lead.createdAt ?? "").localeCompare(a.lead.createdAt ?? ""))
    const newest = apps[0]
    const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(newest.lead.name ?? "")
    const berufsbild = apps.map((a) => mapKanzleistelleBerufsbild(a.occupation)).find(Boolean) ?? null

    // Zusatzfelder: ältere Bewerbungen zuerst, neuere überschreiben. Formularfragen ohne
    // passendes Feld sowie die Leadtable-Notizen kommen in die Beschreibung.
    const customFields: Record<string, string> = {}
    let plz: string | null = null
    let metaLeadId: string | null = null
    const descriptionBlocks: string[] = []
    for (const a of [...apps].reverse()) {
      const answers = mapLeadFormAnswers(a.lead.funnelData?.profile)
      Object.assign(customFields, extractLeadtableCustomFields(a.lead.modifiedData).fields, answers.fields)
      plz = answers.plz ?? plz
      metaLeadId = answers.metaLeadId ?? metaLeadId
      const lines = [
        ...answers.extras.map((e) => `${e.question}: ${e.answer}`),
        ...(notesByLeadId[a.lead._id] ? [`Notizen:\n${notesByLeadId[a.lead._id]}`] : []),
      ]
      if (lines.length > 0) {
        descriptionBlocks.unshift(`Bewerbung ${fmtDate(a.lead.createdAt)} – ${a.customerName} (${a.occupation || "?"}):\n${lines.join("\n")}`)
      }
    }
    const coords = plz ? geocodePlz(plz) : null
    if (plz) withPlz++
    if (metaLeadId) withMetaLeadId++

    const history = apps
      .slice(0, 10)
      .map((a) => `${fmtDate(a.lead.createdAt)}: ${a.customerName} – ${a.occupation || "?"} (${leadtableStatusName(a.lead) || "?"})`)
    const notes =
      (usedLongNameHeuristic ? "[Automatisch bereinigter Name, bitte prüfen] " : "") +
      `Neuimport aus Leadtable. Bewerbungen:\n${history.join("\n")}` +
      (apps.length > 10 ? `\n… und ${apps.length - 10} weitere` : "")
    return {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: newest.lead.phone ?? null,
      berufsbild,
      status: LEADTABLE_STATUS_MAP[leadtableStatusName(newest.lead)] ?? "neu",
      source: "leadtable",
      leadtable_lead_id: newest.lead._id,
      meta_lead_id: metaLeadId,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
      description: descriptionBlocks.length > 0 ? descriptionBlocks.join("\n\n") : null,
      plz,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      notes,
      created_at: newest.lead.createdAt ?? undefined,
      campaign_id: null,
      client_id: null,
    }
  })

  // ── Alter Stand (für Stammdaten-Übernahme und Löschung) ───────────────────
  const oldClients = await fetchAllRows(db, "clients")
  const oldKanzleiCampaigns = await fetchAllRows(db, "campaigns", (q) => q.eq("kind", "kanzlei"))
  const oldClientByLeadtableId = new Map(oldClients.filter((c) => c.leadtable_customer_id).map((c) => [c.leadtable_customer_id as string, c]))
  const oldCampaignByLeadtableId = new Map(
    oldKanzleiCampaigns.filter((c) => c.leadtable_campaign_id).map((c) => [c.leadtable_campaign_id as string, c])
  )
  const newKanzleiCampaigns = activeCustomers.flatMap((c) => (campaignsByCustomer.get(c._id) ?? []).filter((k) => !k.archived))

  const { count: candidateCount } = await db.from("candidates").select("id", { count: "exact", head: true })
  const { count: clientLogins } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client")

  console.log("\n── Plan ─────────────────────────────────────────")
  console.log(`Löschen: ${candidateCount} Kandidaten, ${oldClients.length} Kunden, ${oldKanzleiCampaigns.length} Kanzlei-Kampagnen, ${clientLogins} Kunden-Logins`)
  console.log(
    `Anlegen: ${activeCustomers.length} Kunden (${activeCustomers.filter((c) => oldClientByLeadtableId.get(c._id)?.plz).length} mit übernommener PLZ), ` +
      `${newKanzleiCampaigns.length} Kanzlei-Kampagnen, ${candidateRows.length} Kandidaten`
  )
  console.log(
    `Leads gesamt ${leads.length}; übersprungen: ${skippedRejected} abgesagt, ${skippedDeleted} gelöscht, ${skippedTest} Test-Leads, ` +
      `${skippedNoEmail} ohne E-Mail; ${leads.length - skippedRejected - skippedDeleted - skippedTest - skippedNoEmail - candidateRows.length} Mehrfach-Bewerbungen zusammengeführt`
  )
  const fieldCounts: Record<string, number> = {}
  for (const r of candidateRows) for (const k of Object.keys(r.custom_fields ?? {})) fieldCounts[k] = (fieldCounts[k] ?? 0) + 1
  console.log(
    `Mit Wohnort-PLZ (Standort fürs Matching): ${withPlz}, mit Meta-Lead-ID: ${withMetaLeadId}, mit Beschreibung: ${candidateRows.filter((r) => r.description).length}`
  )
  console.log("Zusatzfelder befüllt:", fieldCounts)
  const statusCounts: Record<string, number> = {}
  for (const r of candidateRows) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1
  console.log("Status der Kandidaten:", statusCounts)

  if (!execute) {
    console.log("\nTrockenlauf beendet. Zum Ausführen: npx tsx scripts/leadtable-neuimport.ts --ausfuehren")
    return
  }

  // ── 1. Sicherung ─────────────────────────────────────────────────────────
  const backupDir = path.resolve(__dirname, `../backups/neuimport-${new Date().toISOString().replace(/[:.]/g, "-")}`)
  fs.mkdirSync(backupDir, { recursive: true })
  const backupTables = [
    "candidates", "candidate_history", "candidate_files", "client_assignments", "client_assignment_notes",
    "candidate_campaign_matches", "qualified_candidates", "custom_field_review_queue", "campaign_automations",
    "campaign_automation_runs", "clients", "client_contacts", "client_files", "campaigns", "profiles", "tasks", "locations",
  ]
  for (const t of backupTables) {
    const rows = await fetchAllRows(db, t)
    fs.writeFileSync(path.join(backupDir, `${t}.json`), JSON.stringify(rows, null, 1))
  }
  console.log(`\nSicherung geschrieben: ${backupDir}`)

  // ── 2. Löschen ───────────────────────────────────────────────────────────
  async function del(table: string, apply: (q: ReturnType<ReturnType<Db["from"]>["delete"]>) => unknown, label = table) {
    const { error, count } = (await apply(db.from(table).delete({ count: "exact" }))) as { error: { message: string } | null; count: number | null }
    if (error) throw new Error(`Löschen ${label}: ${error.message}`)
    console.log(`  gelöscht ${label}: ${count ?? "?"}`)
  }
  const all = (q: ReturnType<ReturnType<Db["from"]>["delete"]>) => q.not("id", "is", null)

  console.log("\nLösche…")
  await del("candidate_history", all)
  await del("candidate_files", all)
  await del("client_assignment_notes", all)
  await del("client_assignments", all)
  await del("candidate_campaign_matches", all)
  await del("qualified_candidates", all)
  await del("campaign_automation_runs", all)
  await del("campaign_automations", all)
  await del("tasks", (q) => q.not("candidate_id", "is", null))
  await del("candidates", all)
  await del("client_contacts", all)
  await del("client_files", all)
  await del("campaigns", (q) => q.eq("kind", "kanzlei"), "Kanzlei-Kampagnen")

  const { data: clientProfiles, error: profilesError } = await db.from("profiles").select("id, email").eq("role", "client")
  if (profilesError) throw new Error(profilesError.message)
  for (const p of clientProfiles ?? []) {
    const { error } = await db.auth.admin.deleteUser(p.id as string)
    if (error) throw new Error(`Login ${p.email} löschen: ${error.message}`)
  }
  console.log(`  gelöscht Kunden-Logins: ${(clientProfiles ?? []).length}`)
  await del("profiles", (q) => q.not("client_id", "is", null), "restliche Kunden-Profile")
  await del("clients", all)

  // ── 3. Kunden + Kanzlei-Kampagnen ────────────────────────────────────────
  console.log("\nLege Kunden an…")
  const carryClient = ["plz", "lat", "lng", "ort", "contact_email", "contact_name", "phone", "logo_url", "tags", "kanzleistelle_company_id"]
  let campaignsCreated = 0
  for (const c of activeCustomers) {
    const old = oldClientByLeadtableId.get(c._id)
    const carried = Object.fromEntries(carryClient.filter((k) => old?.[k] !== null && old?.[k] !== undefined).map((k) => [k, old![k]]))
    const { data: client, error } = await db
      .from("clients")
      .insert({ ...carried, name: c.name, leadtable_customer_id: c._id, status: "active", agency_id: DEFAULT_AGENCY_ID })
      .select("id, plz, lat, lng")
      .single()
    if (error) throw new Error(`Kunde ${c.name}: ${error.message}`)

    for (const k of (campaignsByCustomer.get(c._id) ?? []).filter((k) => !k.archived)) {
      const oldCampaign = oldCampaignByLeadtableId.get(k._id)
      // Standort: eigener der alten Kampagne, sonst der des Kunden.
      const plz = (oldCampaign?.plz as string | null) ?? (client.plz as string | null) ?? null
      const lat = (oldCampaign?.plz ? oldCampaign.lat : client.lat) as number | null
      const lng = (oldCampaign?.plz ? oldCampaign.lng : client.lng) as number | null
      const title = k.occupation ?? ""
      const { error: campaignError } = await db.from("campaigns").insert({
        title,
        kind: "kanzlei",
        client_id: client.id,
        agency_id: DEFAULT_AGENCY_ID,
        leadtable_campaign_id: k._id,
        status: "active",
        berufsbild: (oldCampaign?.berufsbild as string | null) ?? mapKanzleistelleBerufsbild(title),
        plz,
        lat: lat ?? null,
        lng: lng ?? null,
        location_id: await getOrCreateLocationForPlz(db as never, plz),
      })
      if (campaignError) throw new Error(`Kampagne ${title} (${c.name}): ${campaignError.message}`)
      campaignsCreated++
    }
  }
  console.log(`  ${activeCustomers.length} Kunden, ${campaignsCreated} Kanzlei-Kampagnen angelegt`)

  // ── 4. Kandidaten ────────────────────────────────────────────────────────
  console.log("\nLege Kandidaten an…")
  let inserted = 0
  for (let i = 0; i < candidateRows.length; i += INSERT_CHUNK) {
    const { error } = await db.from("candidates").insert(candidateRows.slice(i, i + INSERT_CHUNK))
    if (error) throw new Error(`Kandidaten ${i}-${i + INSERT_CHUNK}: ${error.message}`)
    inserted += Math.min(INSERT_CHUNK, candidateRows.length - i)
    console.log(`  ${inserted}/${candidateRows.length}`)
  }

  console.log("\n── Fertig ───────────────────────────────────────")
  console.log("Ganz am Ende:")
  console.log("  npx tsx scripts/meta-leads-sync.ts --alle          (Meta-Altleads)")
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
