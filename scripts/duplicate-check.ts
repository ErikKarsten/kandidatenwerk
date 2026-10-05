// Tägliche Dublettenprüfung für Kunden und Kandidaten (GitHub Action duplicate-check.yml).
// Seit Paket 14 (05.10.2026): Verdachtsfälle landen in der Sektion "Dubletten" bei den
// Fehlermeldungen (duplicate_cases) und werden dort zusammengeführt, ignoriert oder
// gelöscht. Die Mail an die Admins kommt nur noch bei NEUEN Fällen und verlinkt dorthin -
// ignorierte Fälle tauchen nicht wieder auf. Erkennung: src/lib/duplicates.ts.
//
// Usage:
//   npx tsx scripts/duplicate-check.ts             (prüft, legt neue Fälle an, Mail bei neuen Fällen)
//   npx tsx scripts/duplicate-check.ts --dry-run    (zeigt nur die neuen Fälle, schreibt/verschickt nichts)

import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { sendEmail } from "../src/lib/brevo-mail"
import { getAdminEmails } from "../src/lib/get-admin-emails"
import { caseSignature, findCandidateDuplicates, findClientDuplicates, runDuplicateDetection } from "../src/lib/duplicates"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const LINK = "https://kandidatenwerk.kanzleistelle24.de/dashboard/fehlermeldungen?bereich=dubletten"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
  const db = supabase as unknown as SupabaseClient

  if (dryRun) {
    const [{ data: clients }, { data: candidates }, { data: existing }] = await Promise.all([
      db.from("clients").select("id, name, plz").neq("status", "Archiviert"),
      db.from("candidates").select("id, first_name, last_name, email, plz").eq("is_demo", false).limit(10000),
      db.from("duplicate_cases").select("signature"),
    ])
    const known = new Set((existing ?? []).map((r) => r.signature as string))
    const findings = [...findClientDuplicates(clients ?? []), ...findCandidateDuplicates(candidates ?? [])]
    const fresh = findings.filter((f) => !known.has(caseSignature(f.kind, f.recordIds)))
    console.log(`[DRY-RUN] ${findings.length} Verdachtsfälle, davon ${fresh.length} neu:`)
    for (const f of fresh) console.log(` - ${f.kind}: ${f.reason} (${f.recordIds.join(", ")})`)
    return
  }

  const { newCases, total } = await runDuplicateDetection(db)
  console.log(`${total} Verdachtsfälle insgesamt, ${newCases.length} neu angelegt.`)
  if (newCases.length === 0) return

  const kunden = newCases.filter((c) => c.kind === "kunde").length
  const kandidaten = newCases.length - kunden
  const recipients = await getAdminEmails(supabase)
  if (recipients.length === 0) return
  await sendEmail(
    recipients,
    `Kandidatenwerk: ${newCases.length} neue Dubletten-Verdachtsfälle`,
    `<p>Die tägliche Dublettenprüfung hat neue Verdachtsfälle gefunden: ${kunden} Kundendublette(n), ${kandidaten} Kandidatendublette(n).</p>
<p><a href="${LINK}">In Kandidatenwerk prüfen</a> – dort zusammenführen, ignorieren oder löschen. Ignorierte Fälle werden nicht erneut gemeldet.</p>`
  )
}

main().catch((err) => {
  console.error("FATALER FEHLER:", err instanceof Error ? err.message : err)
  process.exit(1)
})
