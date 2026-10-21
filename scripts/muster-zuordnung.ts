// Beispielkandidaten für Live-Kunden (Paket 76) - Probelauf bzw. Lauf von Hand.
//   npx tsx scripts/muster-zuordnung.ts                 Probelauf: was jetzt fällig wäre
//   npx tsx scripts/muster-zuordnung.ts --in-tagen=3    Probelauf für einen späteren Tag
//   npx tsx scripts/muster-zuordnung.ts --ausfuehren    ordnet zu (wie der stündliche Lauf)
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const { runSampleFeed } = await import("../src/lib/sample-feed")
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const EXECUTE = process.argv.includes("--ausfuehren")
const days = Number(process.argv.find((a) => a.startsWith("--in-tagen="))?.split("=")[1] ?? 0)
const now = new Date(Date.now() + days * 86_400_000)

const r = await runSampleFeed(db, { now, dryRun: !EXECUTE })
console.log(`MODUS: ${EXECUTE ? "AUSFÜHREN" : `Probelauf${days ? ` für in ${days} Tagen` : ""}`}`)
console.log(`Kanzleien mit fälligem Beispielkandidaten: ${r.clients}`)
for (const p of r.planned) console.log(`  ${p}`)
if (EXECUTE) console.log(`Zugeordnet: ${r.assigned}, davon neu erzeugt: ${r.generated}`)
if (r.skipped.length) console.log(`Übersprungen:\n  ${r.skipped.join("\n  ")}`)
if (r.errors.length) console.log(`Fehler:\n  ${r.errors.join("\n  ")}`)
