// Synchronisiert den aktuellen Leadtable-Status für alle Leadtable-Kandidaten nach
// Kandidatenwerk. Leadtable-Stand gewinnt immer, auch wenn candidates.status seither
// manuell geändert wurde.
//
// Setzt voraus, dass die Migration
// supabase/migrations/20260804000000_add_candidates_leadtable_lead_id.sql bereits
// angewendet wurde (candidates.leadtable_lead_id muss existieren).
//
// Nutzt, wo vorhanden, GET /lead/{leadtable_lead_id} (zuverlässiger als die
// E-Mail-Suche). Ist noch keine Lead-ID gespeichert, wird per searchLeadByMail
// gesucht und die gefundene ID gleich für künftige Läufe (und den geplanten
// Beschreibungs-Import) in candidates.leadtable_lead_id gespeichert.
//
// Usage:
//   npx tsx scripts/leadtable-status-sync.ts            (alle Kandidaten)
//   npx tsx scripts/leadtable-status-sync.ts --limit=15  (nur die ersten 15, zum Testen)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { leadtableFetch } from "../src/lib/leadtable-client"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const DELAY_MS = 250
const PROGRESS_EVERY = 30

// 1:1-Mapping der Leadtable-Statusnamen auf unsere 8 dafür vorgesehenen Kandidatenwerk-
// Status ("vorgestellt" hat keine Leadtable-Entsprechung, wird hier nie gesetzt).
const STATUS_MAP: Record<string, string> = {
  Unbearbeitet: "neu",
  Vorqualifiziert: "vorqualifiziert",
  "Nicht erreicht": "nicht_erreicht",
  "2x nicht erreicht + Mail": "nicht_erreicht_mail",
  "In Kontakt": "in_kontakt",
  Vorstellungsgespräch: "interview",
  Absage: "abgelehnt",
  "aktuell kein Interesse": "abgelehnt",
  Eingestellt: "platziert",
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function withRetry<T>(fn: () => Promise<T>, retries = 6): Promise<T> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("429") && attempt < retries - 1) {
        await sleep(2000 * (attempt + 1))
        continue
      }
      throw err
    }
  }
  throw new Error("unreachable")
}

interface LeadtableLead {
  _id: string
  // Flaches "status" existiert nur in der GET /lead/{leadID}-Antwort, nicht bei
  // searchLeadByMail - dort gibt es nur statusID.name. Beide werden unterstützt,
  // statusID.name hat Vorrang, da in beiden Endpunkten vorhanden.
  status?: string
  statusID?: { name?: string }
}

function parseLimitArg(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--limit="))
  if (!arg) return null
  const value = Number(arg.split("=")[1])
  return Number.isFinite(value) && value > 0 ? value : null
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const limit = parseLimitArg()
  const startedAt = Date.now()

  console.log("=== Leadtable-Kandidaten laden ===")
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, status, leadtable_lead_id")
    .eq("source", "leadtable")
    .not("email", "is", null)

  if (error) throw new Error(error.message)

  let list = candidates ?? []
  console.log(`${list.length} Kandidaten geladen`)
  if (limit) {
    list = list.slice(0, limit)
    console.log(`Test-Limit aktiv: nur die ersten ${list.length} Kandidaten`)
  }
  console.log("")

  const totals = {
    changed: 0,
    unchanged: 0,
    notFound: 0,
    unmappedStatus: 0,
    errors: 0,
  }
  const changes: { name: string; before: string; after: string }[] = []
  const errorDetails: { name: string; id: string; message: string }[] = []

  for (let i = 0; i < list.length; i++) {
    const candidate = list[i]
    const email = (candidate.email ?? "").trim().split(/\s+/)[0]
    const name = `${candidate.first_name} ${candidate.last_name}`

    try {
      await sleep(DELAY_MS)

      let lead: LeadtableLead | undefined
      let newLeadId: string | null = null

      if (candidate.leadtable_lead_id) {
        const resp = await withRetry(() =>
          leadtableFetch<{ lead: LeadtableLead }>(`/lead/${candidate.leadtable_lead_id}`)
        )
        lead = resp.lead
      } else {
        const resp = await withRetry(() =>
          leadtableFetch<{ leads: LeadtableLead[] }>(`/searchLeadByMail/${encodeURIComponent(email)}`)
        )
        lead = resp.leads[0]
        if (lead) newLeadId = lead._id
      }

      if (!lead) {
        totals.notFound++
      } else {
        const leadtableStatus = lead.statusID?.name ?? lead.status ?? ""
        const mappedStatus = STATUS_MAP[leadtableStatus]

        if (!mappedStatus) {
          totals.unmappedStatus++
          errorDetails.push({
            name,
            id: candidate.id,
            message: `Unbekannter Leadtable-Status "${leadtableStatus}" - kein Mapping, Status nicht geändert`,
          })
        } else {
          // status und leadtable_lead_id bewusst in getrennten Updates: mehrere
          // candidates-Zeilen können dieselbe E-Mail (und damit denselben Leadtable-
          // Lead) haben, z.B. bei Bewerbungen auf mehrere Kampagnen. Die UNIQUE-
          // Constraint auf leadtable_lead_id schlägt dann für die zweite Zeile fehl -
          // das darf den Status-Sync (Pflichtteil) nicht verhindern.
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

          if (mappedStatus === candidate.status) {
            totals.unchanged++
          } else {
            totals.changed++
            changes.push({ name, before: candidate.status, after: mappedStatus })
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("404")) {
        totals.notFound++
      } else {
        totals.errors++
        errorDetails.push({ name, id: candidate.id, message })
      }
    }

    if ((i + 1) % PROGRESS_EVERY === 0 || i === list.length - 1) {
      console.log(
        `[${i + 1}/${list.length}] Zwischensumme: geändert: ${totals.changed}, unverändert: ${totals.unchanged}, ` +
          `nicht gefunden: ${totals.notFound}, unbekannter Status: ${totals.unmappedStatus}, Fehler: ${totals.errors}`
      )
    }
  }

  const durationSec = (Date.now() - startedAt) / 1000

  console.log("")
  console.log("=== Beispiele geänderter Status (erste 15) ===")
  changes.slice(0, 15).forEach((c) => console.log(`  ${c.name}: ${c.before} -> ${c.after}`))

  if (errorDetails.length > 0) {
    console.log("")
    console.log("=== Fehler / unbekannte Status ===")
    errorDetails.forEach((e) => console.log(`  ${e.name} [${e.id}]: ${e.message}`))
  }

  console.log("")
  console.log("=== Gesamtsumme ===")
  console.log(JSON.stringify(totals, null, 2))

  console.log("")
  console.log("=== Laufzeit ===")
  console.log(`Dauer: ${durationSec.toFixed(1)}s für ${list.length} Kandidaten`)
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
