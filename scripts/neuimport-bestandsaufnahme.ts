// Bestandsaufnahme für den Neuimport (Atlas T-20) - liest nur, schreibt nichts.
// 1. Leadtable: alle Kunden (archiviert/aktiv), je Kunde Kampagnen und Leads nach Status.
// 2. Close: je aktivem Leadtable-Kunden ein gleichnamiger Close-Lead im Status "Gewonnen"?
// Ergebnis: neuimport/bestandsaufnahme.json und neuimport/close-abgleich.csv (Ordner ist
// per .gitignore ausgeschlossen - enthält Firmennamen).
//
// Usage: npx tsx scripts/neuimport-bestandsaufnahme.ts
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { fetchAllCampaigns, fetchAllCustomers } from "../src/lib/leadtable-import-customers"
import { closeList } from "../src/lib/close-api"
import { normalizeCompanyName } from "../src/lib/close-webhook"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })


interface Lead {
  _id: string
  status?: string
  email?: string
}

async function fetchLeads(campaignId: string): Promise<Lead[]> {
  const first = await leadtableFetch<{ pages: { totalPages: number }; leads: Lead[] }>(`/lead/campaign/${campaignId}`, { page: 1, limit: 50 })
  const leads = [...first.leads]
  for (let page = 2; page <= first.pages.totalPages; page++) {
    leads.push(...(await leadtableFetch<{ leads: Lead[] }>(`/lead/campaign/${campaignId}`, { page, limit: 50 })).leads)
  }
  return leads
}

interface CloseLeadLite {
  id: string
  display_name: string
  status_label: string
}

async function closeCandidates(name: string): Promise<CloseLeadLite[]> {
  const words = normalizeCompanyName(name).split(" ").filter((w) => w.length > 2).slice(0, 3)
  if (words.length === 0) return []
  const query = encodeURIComponent(words.map((w) => `name:${w}`).join(" "))
  return closeList<CloseLeadLite>(`/lead/?query=${query}&_fields=id,display_name,status_label`, 200)
}

async function main() {
  const outDir = path.resolve(__dirname, "../neuimport")
  fs.mkdirSync(outDir, { recursive: true })

  const customers = await fetchAllCustomers()
  const report: Record<string, unknown>[] = []
  const totals = { kunden: customers.length, aktiv: 0, kampagnen: 0, leads: 0, status: {} as Record<string, number>, ohneEmail: 0 }
  const csv = ["leadtable_kunde;archiviert;leads;vorqualifiziert;close_treffer_gewonnen;close_leads;ergebnis"]

  for (const customer of customers) {
    const campaigns = await fetchAllCampaigns(customer._id)
    const statusCount: Record<string, number> = {}
    let leadCount = 0
    for (const campaign of campaigns) {
      const leads = await fetchLeads(campaign._id)
      leadCount += leads.length
      for (const lead of leads) {
        const s = lead.status || "(ohne)"
        statusCount[s] = (statusCount[s] ?? 0) + 1
        totals.status[s] = (totals.status[s] ?? 0) + 1
        if (!lead.email) totals.ohneEmail++
      }
    }
    totals.kampagnen += campaigns.length
    totals.leads += leadCount
    if (!customer.archived) totals.aktiv++

    let ergebnis = "archiviert - nur Leads"
    let wonNames: string[] = []
    let allNames: string[] = []
    if (!customer.archived) {
      const found = await closeCandidates(customer.name)
      const wanted = normalizeCompanyName(customer.name)
      const sameName = found.filter((l) => normalizeCompanyName(l.display_name) === wanted)
      const pool = sameName.length > 0 ? sameName : found
      const won = pool.filter((l) => /gewonnen/i.test(l.status_label ?? ""))
      wonNames = won.map((l) => `${l.display_name} (${l.id})`)
      allNames = pool.map((l) => `${l.display_name} [${l.status_label}]`)
      ergebnis = won.length === 1 ? (sameName.length > 0 ? "eindeutig" : "eindeutig (Name ähnlich)") : won.length === 0 ? "kein Close-Lead auf Gewonnen" : "mehrdeutig"
    }
    report.push({ name: customer.name, id: customer._id, archived: !!customer.archived, campaigns: campaigns.length, leads: leadCount, statusCount, ergebnis, closeGewonnen: wonNames, closeAlle: allNames })
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    csv.push([esc(customer.name), customer.archived ? "ja" : "nein", leadCount, statusCount["Vorqualifiziert"] ?? 0, esc(wonNames.join(" | ")), esc(allNames.slice(0, 5).join(" | ")), ergebnis].join(";"))
    process.stdout.write(".")
  }

  fs.writeFileSync(path.join(outDir, "bestandsaufnahme.json"), JSON.stringify({ totals, customers: report }, null, 1))
  fs.writeFileSync(path.join(outDir, "close-abgleich.csv"), "﻿" + csv.join("\n"))
  const byResult = report.reduce<Record<string, number>>((acc, r) => ((acc[r.ergebnis as string] = (acc[r.ergebnis as string] ?? 0) + 1), acc), {})
  console.log("\n", JSON.stringify(totals, null, 1))
  console.log("Close-Abgleich:", byResult)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
