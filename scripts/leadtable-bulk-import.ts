// Vollständiger Leadtable-Import über alle Kunden.
// Läuft bewusst als reines Node-Skript (nicht über den Cloudflare Worker),
// um das Subrequest-Limit von Workers zu umgehen.
//
// Usage:
//   npx tsx scripts/leadtable-bulk-import.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { importLeadtableCampaign, type ImportLeadtableCampaignResult } from "../src/lib/leadtable-import"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 200
const PROGRESS_EVERY = 20

interface Pagination {
  totalItems: number
  totalPages: number
  currentPage: number
  itemsPerPage: number
}
interface Customer {
  _id: string
  name: string
  [key: string]: unknown
}
interface CustomersResponse {
  pagination: Pagination
  customers: Customer[]
}
interface Campaign {
  _id: string
  occupation?: string
  [key: string]: unknown
}
interface CampaignsResponse {
  pagination: Pagination
  campaigns: Campaign[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchAllCampaignsForCustomer(customerId: string): Promise<Campaign[]> {
  const firstPage = await leadtableFetch<CampaignsResponse>(`/campaign/all/${customerId}`, {
    page: 1,
    limit: 100,
  })
  const campaigns = [...firstPage.campaigns]
  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    await sleep(DELAY_MS)
    const nextPage = await leadtableFetch<CampaignsResponse>(`/campaign/all/${customerId}`, {
      page,
      limit: 100,
    })
    campaigns.push(...nextPage.campaigns)
  }
  return campaigns
}

type RunError = { customer: string; campaign?: string; message: string }

async function fetchAllCustomers(): Promise<Customer[]> {
  const firstPage = await leadtableFetch<CustomersResponse>("/customer/all", { page: 1, limit: 100 })
  const customers = [...firstPage.customers]
  for (let page = 2; page <= firstPage.pagination.totalPages; page++) {
    await sleep(DELAY_MS)
    const nextPage = await leadtableFetch<CustomersResponse>("/customer/all", { page, limit: 100 })
    customers.push(...nextPage.customers)
  }
  return customers
}

async function main() {
  const startedAt = Date.now()

  console.log("=== Alle Kunden laden ===")
  const customers = await fetchAllCustomers()
  console.log(`${customers.length} Kunden geladen`)
  console.log("")

  const totals: Omit<ImportLeadtableCampaignResult, "createdCandidateIds"> = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errors: [],
  }
  const runErrors: RunError[] = []
  let sinceLastProgress = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errorCount: 0,
  }

  function printProgress(customerIndex: number) {
    console.log(
      `[${customerIndex}/${customers.length}] Zwischensumme (letzte ${PROGRESS_EVERY} Kunden): ` +
        `created: ${sinceLastProgress.created}, skippedAbsage: ${sinceLastProgress.skippedAbsage}, ` +
        `skippedNoEmail: ${sinceLastProgress.skippedNoEmail}, skippedDuplicate: ${sinceLastProgress.skippedDuplicate}, ` +
        `errors: ${sinceLastProgress.errorCount} | Gesamt bisher: created: ${totals.created}, ` +
        `skipped: ${totals.skippedAbsage + totals.skippedNoEmail + totals.skippedDuplicate}, errors: ${totals.errors.length}`
    )
    sinceLastProgress = { created: 0, skippedAbsage: 0, skippedNoEmail: 0, skippedDuplicate: 0, errorCount: 0 }
  }

  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i]

    let campaigns: Campaign[]
    try {
      await sleep(DELAY_MS)
      campaigns = await fetchAllCampaignsForCustomer(customer._id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kunde ${i + 1}/${customers.length}: ${customer.name} - FEHLER beim Laden der Kampagnen: ${message}`)
      runErrors.push({ customer: customer.name, message })
      sinceLastProgress.errorCount++
      continue
    }

    for (const campaign of campaigns) {
      const campaignName = campaign.occupation ?? "(ohne Namen)"
      try {
        await sleep(DELAY_MS)
        const result = await importLeadtableCampaign(customer._id, campaign._id, campaignName)

        totals.created += result.created
        totals.skippedAbsage += result.skippedAbsage
        totals.skippedNoEmail += result.skippedNoEmail
        totals.skippedDuplicate += result.skippedDuplicate
        totals.errors.push(...result.errors)

        sinceLastProgress.created += result.created
        sinceLastProgress.skippedAbsage += result.skippedAbsage
        sinceLastProgress.skippedNoEmail += result.skippedNoEmail
        sinceLastProgress.skippedDuplicate += result.skippedDuplicate
        sinceLastProgress.errorCount += result.errors.length

        if (result.errors.length > 0) {
          console.log(
            `  -> Kunde "${customer.name}", Kampagne "${campaignName}": ${result.errors.length} Lead-Fehler`
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.log(`Kunde ${i + 1}/${customers.length}: ${customer.name} - Kampagne "${campaignName}" - FEHLER: ${message}`)
        runErrors.push({ customer: customer.name, campaign: campaignName, message })
        sinceLastProgress.errorCount++
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === customers.length - 1) {
      printProgress(i + 1)
    }
  }

  const durationMs = Date.now() - startedAt
  const durationSec = durationMs / 1000

  console.log("")
  console.log("=== Gesamtsumme über alle Kunden ===")
  console.log(JSON.stringify({ ...totals, errorCount: totals.errors.length }, null, 2))

  if (runErrors.length > 0) {
    console.log("")
    console.log(`=== Fehler außerhalb einzelner Leads (${runErrors.length}) ===`)
    runErrors.forEach((e) =>
      console.log(`  Kunde "${e.customer}"${e.campaign ? ` / Kampagne "${e.campaign}"` : ""}: ${e.message}`)
    )
  }

  console.log("")
  console.log(`=== Laufzeit ===`)
  console.log(`Dauer: ${durationSec.toFixed(1)}s (${(durationSec / 60).toFixed(1)} Minuten) für ${customers.length} Kunden`)
  console.log(`Ø pro Kunde: ${(durationSec / customers.length).toFixed(2)}s`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
