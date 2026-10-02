// CLI-Einstieg für den Meta-Leads-Sync. Die eigentliche Logik liegt seit 02.10.2026 in
// src/lib/cron/meta-leads-sync.ts und läuft regulär alle 30 Minuten per Cloudflare Cron
// Trigger (custom-worker.ts -> /api/cron/meta-leads-sync). Dieses Skript bleibt für
// manuelle Läufe und den GitHub-Workflow (nur noch workflow_dispatch).
//
// Usage:
//   npx tsx scripts/meta-leads-sync.ts                              (voller Lauf, alle Kampagnen mit meta_form_id)
//   npx tsx scripts/meta-leads-sync.ts --limit=5                    (kleiner Testlauf, max. 5 Leads pro Formular)
//   npx tsx scripts/meta-leads-sync.ts --campaignId=<uuid>          (nur eine bestimmte Kampagne)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { syncMetaLeads } from "../src/lib/cron/meta-leads-sync"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

function parseArgs(): { limit: number | null; campaignId: string | null } {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="))
  const campaignIdArg = process.argv.find((a) => a.startsWith("--campaignId="))
  const limit = limitArg ? Number(limitArg.split("=")[1]) : null
  return {
    limit: Number.isFinite(limit) && (limit ?? 0) > 0 ? limit : null,
    campaignId: campaignIdArg ? campaignIdArg.split("=")[1] : null,
  }
}

async function main() {
  const { limit, campaignId } = parseArgs()

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const result = await syncMetaLeads(supabase, { limit, campaignId })

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
