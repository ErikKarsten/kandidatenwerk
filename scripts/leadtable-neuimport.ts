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
//      Benachrichtigungs-Mails.
//
// Danach (eigene Skripte, siehe Ausgabe am Ende): Leadtable-Beschreibungen nachladen,
// ganz am Ende Meta-Altleads (--alle).
//
// Läuft bewusst lokal (nicht im Worker) wegen Cloudflares Unteranfragen-Limit.
//
// Usage:
//   npx tsx scripts/leadtable-neuimport.ts                (Trockenlauf: zählt nur, ändert nichts)
//   npx tsx scripts/leadtable-neuimport.ts --ausfuehren   (Sicherung, Löschen, Import)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { fetchAllCustomers, fetchAllCampaigns, type LeadtableCampaign } from "../src/lib/leadtable-import-customers"
import { cleanLeadtableEmail, extractCleanName, isTestLead, type LeadtableLead } from "../src/lib/leadtable-import"
import {
  extractLeadtableCustomFields,
  LEADTABLE_STATUS_MAP,
  leadtableStatusName,
  sleep,
} from "../src/lib/leadtable-sync-shared"
import { mapKanzleistelleBerufsbild } from "../src/lib/sync-kanzleistelle"
import { getOrCreateLocationForPlz } from "../src/lib/location-clustering"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const DEFAULT_AGENCY_ID = "00000000-0000-0000-0000-000000000001"
const DELAY_MS = 300
const INSERT_CHUNK = 200

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
  lead: LeadtableLead & { createdAt?: string; deleted?: boolean; statusID?: { name?: string }; modifiedData?: Record<string, unknown> }
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

  // ── Leadtable laden ───────────────────────────────────────────────────────
  console.log("\nLade Leadtable-Kunden und -Kampagnen…")
  const customers = await withRetry(() => fetchAllCustomers())
  const activeCustomers = customers.filter((c) => c.archived === false)
  const campaignsByCustomer = new Map<string, LeadtableCampaign[]>()
  for (const c of customers) {
    await sleep(DELAY_MS)
    campaignsByCustomer.set(c._id, await withRetry(() => fetchAllCampaigns(c._id)))
  }
  const allCampaigns = [...campaignsByCustomer.values()].flat()
  console.log(`${customers.length} Kunden (${activeCustomers.length} aktiv), ${allCampaigns.length} Kampagnen.`)

  console.log("Lade alle Leads…")
  const leads: LeadWithContext[] = []
  let done = 0
  for (const c of customers) {
    for (const camp of campaignsByCustomer.get(c._id) ?? []) {
      await sleep(DELAY_MS)
      for (const lead of await fetchCampaignLeads(camp._id)) {
        leads.push({ lead, customerName: c.name, occupation: camp.occupation ?? "" })
      }
      if (++done % 50 === 0) console.log(`  ${done}/${allCampaigns.length} Kampagnen, ${leads.length} Leads`)
    }
  }

  // ── Kandidaten bilden: eine Person je E-Mail, neueste Bewerbung führt ─────
  let skippedTest = 0
  let skippedNoEmail = 0
  let skippedDeleted = 0
  const byEmail = new Map<string, LeadWithContext[]>()
  for (const l of leads) {
    if (l.lead.deleted) {
      skippedDeleted++
      continue
    }
    if (isTestLead(l.lead)) {
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

  const candidateRows = [...byEmail.entries()].map(([email, apps]) => {
    apps.sort((a, b) => (b.lead.createdAt ?? "").localeCompare(a.lead.createdAt ?? ""))
    const newest = apps[0]
    const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(newest.lead.name ?? "")
    const berufsbild = apps.map((a) => mapKanzleistelleBerufsbild(a.occupation)).find(Boolean) ?? null
    // Ältere Antworten zuerst, neuere überschreiben.
    const customFields: Record<string, string> = {}
    for (const a of [...apps].reverse()) Object.assign(customFields, extractLeadtableCustomFields(a.lead.modifiedData).fields)
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
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
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
    `Leads gesamt ${leads.length}; übersprungen: ${skippedDeleted} gelöscht, ${skippedTest} Test-Leads, ${skippedNoEmail} ohne E-Mail; ` +
      `${leads.length - skippedDeleted - skippedTest - skippedNoEmail - candidateRows.length} Mehrfach-Bewerbungen zusammengeführt`
  )
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
  console.log("Als Nächstes (ohne Kunden-Zuordnung, ohne Mails):")
  console.log("  npx tsx scripts/leadtable-description-import.ts   (Leadtable-Notizen nachladen)")
  console.log("Ganz am Ende:")
  console.log("  npx tsx scripts/meta-leads-sync.ts --alle          (Meta-Altleads)")
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
