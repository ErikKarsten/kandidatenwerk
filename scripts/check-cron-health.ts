// Täglicher Cron-Wächter (.github/workflows/cron-health.yml): prüft in cron_job_runs,
// ob jeder Cloudflare-Cron-Job zuletzt rechtzeitig ERFOLGREICH lief, und schickt sonst
// eine Mail an alle Agentur-Admins. Läuft bewusst außerhalb von Cloudflare, damit auch
// auffällt, wenn die Cron Trigger im Worker komplett ausfallen (dann schreibt der
// Worker selbst ja nichts mehr). Einzelne Fehlschläge meldet bereits der Worker
// (src/lib/cron/job-runs.ts) - hier geht es um "läuft überhaupt noch?".
//
// Exit-Code 1 bei Problemen - GitHub benachrichtigt dann zusätzlich per Mail über den
// fehlgeschlagenen Workflow.
//
// Usage:
//   npx tsx scripts/check-cron-health.ts             (prüft, verschickt bei Problemen eine Mail)
//   npx tsx scripts/check-cron-health.ts --dry-run   (zeigt nur das Ergebnis, keine Mail)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { sendEmail } from "../src/lib/brevo-mail"
import { getAdminEmails } from "../src/lib/get-admin-emails"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

// Spätester akzeptabler letzter Erfolg je Job (großzügig über dem jeweiligen Takt).
const MAX_AGE_MINUTES: Record<string, number> = {
  "run-automations": 30, // alle 5 Min.
  "meta-leads-sync": 120, // alle 30 Min.
  "sync-kanzleistelle": 180, // stündlich
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )
  // cron_job_runs ist (noch) nicht in database.ts generiert
  const db = supabase as unknown as SupabaseClient

  const problems: string[] = []
  for (const [job, maxAge] of Object.entries(MAX_AGE_MINUTES)) {
    const { data, error } = await db
      .from("cron_job_runs")
      .select("started_at")
      .eq("job", job)
      .eq("ok", true)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`cron_job_runs nicht lesbar: ${error.message}`)

    const lastOk = data?.started_at as string | undefined
    const ageMinutes = lastOk ? Math.round((Date.now() - new Date(lastOk).getTime()) / 60000) : null
    const status = ageMinutes === null ? "nie erfolgreich" : `zuletzt erfolgreich vor ${ageMinutes} Min.`
    console.log(`${job}: ${status} (Grenze ${maxAge} Min.)`)
    if (ageMinutes === null || ageMinutes > maxAge) problems.push(`${job}: ${status} (erwartet höchstens ${maxAge} Min.)`)
  }

  if (problems.length === 0) {
    console.log("Alle Cron-Jobs laufen.")
    return
  }

  if (dryRun) {
    console.log("\n[DRY-RUN] Würde Admins benachrichtigen:\n" + problems.join("\n"))
  } else {
    const recipients = await getAdminEmails(supabase)
    if (recipients.length > 0) {
      await sendEmail(
        recipients,
        "Kandidatenwerk: Cron-Jobs laufen nicht wie geplant",
        `<p>Der tägliche Cron-Wächter hat Probleme gefunden:</p><ul>${problems
          .map((p) => `<li>${p}</li>`)
          .join("")}</ul><p>Prüfen mit <code>npx wrangler tail kandidatenwerk</code> bzw. im Cloudflare-Dashboard unter Workers → kandidatenwerk → Logs.</p>`
      )
    }
  }
  process.exitCode = 1
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
