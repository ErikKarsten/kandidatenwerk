// CLI-Einstieg für die Kampagnen-Automatisierungen. Die eigentliche Logik liegt seit
// 02.10.2026 in src/lib/cron/run-automations.ts und läuft regulär alle 5 Minuten per
// Cloudflare Cron Trigger (custom-worker.ts -> /api/cron/run-automations). Dieses
// Skript bleibt für manuelle Läufe und den GitHub-Workflow (nur noch workflow_dispatch).
//
// Usage:
//   npx tsx scripts/run-automations.ts
//   npx tsx scripts/run-automations.ts --dry-run   (zeigt nur, was verschickt würde -
//                                                    kein Versand, kein DB-Schreiben)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { runAutomations } from "../src/lib/cron/run-automations"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  if (dryRun) {
    console.log("=== --dry-run: es wird NICHTS verschickt und NICHTS in campaign_automation_runs/candidate_history geschrieben ===")
    console.log("")
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  const { sent, skipped, errors } = await runAutomations(supabase, { dryRun })

  console.log("")
  console.log(dryRun ? "=== Zusammenfassung (--dry-run, nichts davon wurde tatsächlich ausgeführt) ===" : "=== Zusammenfassung ===")
  console.log(
    JSON.stringify(
      dryRun
        ? { wouldSend: sent, wouldSkip: skipped, errors }
        : { sent, skipped, errors },
      null,
      2
    )
  )
  if (errors > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
