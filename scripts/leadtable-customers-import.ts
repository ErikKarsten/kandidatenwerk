// Import aller relevanten Leadtable-Kunden (archived: false, plus "Kanzleistelle24.de")
// nach Kandidatenwerk, inkl. ihrer nicht-archivierten Kampagnen.
// Läuft bewusst als reines Node-Skript (nicht über den Cloudflare Worker),
// um das Subrequest-Limit von Workers zu umgehen.
//
// Usage:
//   npx tsx scripts/leadtable-customers-import.ts

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { leadtableFetch } from "../src/lib/leadtable-client"
import { importLeadtableCustomer } from "../src/lib/leadtable-import-customers"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 200
const PROGRESS_EVERY = 10
const KEEP_EVEN_IF_ARCHIVED_NAME = "Kanzleistelle24.de"

interface Pagination {
  totalItems: number
  totalPages: number
  currentPage: number
  itemsPerPage: number
}
interface Customer {
  _id: string
  name: string
  archived?: boolean
  [key: string]: unknown
}
interface CustomersResponse {
  pagination: Pagination
  customers: Customer[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

type RunError = { customer: string; message: string }

async function main() {
  const startedAt = Date.now()

  console.log("=== Alle Kunden laden ===")
  const allCustomers = await fetchAllCustomers()
  console.log(`${allCustomers.length} Kunden geladen`)

  const relevantCustomers = allCustomers.filter(
    (c) => c.archived === false || c.name === KEEP_EVEN_IF_ARCHIVED_NAME
  )
  console.log(
    `${relevantCustomers.length} relevante Kunden (archived: false ODER "${KEEP_EVEN_IF_ARCHIVED_NAME}")`
  )
  console.log("")

  const totals = {
    clientsCreated: 0,
    clientsSkipped: 0,
    campaignsCreated: 0,
    campaignsSkippedArchived: 0,
  }
  const runErrors: RunError[] = []
  let sinceLastProgress = {
    clientsCreated: 0,
    clientsSkipped: 0,
    campaignsCreated: 0,
    campaignsSkippedArchived: 0,
    errorCount: 0,
  }

  function printProgress(customerIndex: number) {
    console.log(
      `[${customerIndex}/${relevantCustomers.length}] Zwischensumme (letzte ${PROGRESS_EVERY} Kunden): ` +
        `clientsCreated: ${sinceLastProgress.clientsCreated}, clientsSkipped: ${sinceLastProgress.clientsSkipped}, ` +
        `campaignsCreated: ${sinceLastProgress.campaignsCreated}, campaignsSkippedArchived: ${sinceLastProgress.campaignsSkippedArchived}, ` +
        `errors: ${sinceLastProgress.errorCount} | Gesamt bisher: clientsCreated: ${totals.clientsCreated}, ` +
        `clientsSkipped: ${totals.clientsSkipped}, campaignsCreated: ${totals.campaignsCreated}, ` +
        `campaignsSkippedArchived: ${totals.campaignsSkippedArchived}, errors: ${runErrors.length}`
    )
    sinceLastProgress = {
      clientsCreated: 0,
      clientsSkipped: 0,
      campaignsCreated: 0,
      campaignsSkippedArchived: 0,
      errorCount: 0,
    }
  }

  for (let i = 0; i < relevantCustomers.length; i++) {
    const customer = relevantCustomers[i]

    try {
      await sleep(DELAY_MS)
      const result = await importLeadtableCustomer(customer._id, customer.name)

      if (result.skipped) {
        totals.clientsSkipped++
        sinceLastProgress.clientsSkipped++
      } else {
        totals.clientsCreated++
        totals.campaignsCreated += result.campaignsCreated
        totals.campaignsSkippedArchived += result.campaignsSkippedArchived
        sinceLastProgress.clientsCreated++
        sinceLastProgress.campaignsCreated += result.campaignsCreated
        sinceLastProgress.campaignsSkippedArchived += result.campaignsSkippedArchived
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.log(`Kunde ${i + 1}/${relevantCustomers.length}: ${customer.name} - FEHLER: ${message}`)
      runErrors.push({ customer: customer.name, message })
      sinceLastProgress.errorCount++
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === relevantCustomers.length - 1) {
      printProgress(i + 1)
    }
  }

  const durationMs = Date.now() - startedAt
  const durationSec = durationMs / 1000

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(JSON.stringify({ ...totals, errorCount: runErrors.length }, null, 2))

  if (runErrors.length > 0) {
    console.log("")
    console.log(`=== Fehler (${runErrors.length}) ===`)
    runErrors.forEach((e) => console.log(`  Kunde "${e.customer}": ${e.message}`))
  }

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(
    `Dauer: ${durationSec.toFixed(1)}s (${(durationSec / 60).toFixed(1)} Minuten) für ${relevantCustomers.length} Kunden`
  )
  console.log(`Ø pro Kunde: ${(durationSec / relevantCustomers.length).toFixed(2)}s`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
