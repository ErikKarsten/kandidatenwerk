// Zentraler Meta-Abruf von Hand (Paket 108).
//
//   npx tsx scripts/meta-zentral.ts                 ein Lauf wie der Cron (Konto-Prüfung + letzte Tage)
//   npx tsx scripts/meta-zentral.ts --auffuellen 90 Zahlen pro Anzeige und Tag der letzten 90 Tage
//                                                   nachholen (in 7-Tage-Stücken, mit Pausen)
//   --staging                                       in die Staging-Datenbank schreiben (Meta-Zugang
//                                                   kommt trotzdem aus .env.local; Staging hat keinen)
//
// Liest bei Meta nur.
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const staging = args.includes("--staging")
dotenv.config({ path: path.resolve(__dirname, "../.env.local") })
if (staging) {
  const s = dotenv.config({ path: path.resolve(__dirname, "../.env.staging"), processEnv: {} }).parsed ?? {}
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "NEXT_PUBLIC_APP_URL"]) {
    if (s[k]) process.env[k] = s[k]
  }
}

async function main() {
  const { runMetaZentral, fetchAdDailyInsights, saveAdDailyRows } = await import("../src/lib/meta-zentral")
  const { tagIn } = await import("../src/lib/meta-konto-logik")

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClient
  console.log(`Ziel: ${staging ? "Staging" : "Live"} (${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host})`)

  const i = args.indexOf("--auffuellen")
  if (i >= 0) {
    const tage = Math.min(400, Math.max(1, Number(args[i + 1]) || 90))
    const heute = tagIn(new Date().toISOString(), "Europe/Berlin")
    const tag = (offset: number) => {
      const d = new Date(`${heute}T12:00:00Z`)
      d.setUTCDate(d.getUTCDate() - offset)
      return d.toISOString().slice(0, 10)
    }
    let gesamt = 0
    for (let ende = 0; ende < tage; ende += 7) {
      const until = tag(ende)
      const since = tag(Math.min(tage - 1, ende + 6))
      const rows = await fetchAdDailyInsights(since, until)
      const n = await saveAdDailyRows(db, rows)
      gesamt += n
      console.log(`✓ ${since} bis ${until}: ${n} Tageszeilen`)
      await new Promise((r) => setTimeout(r, 3000)) // Meta nicht drängen
    }
    console.log(`Fertig: ${gesamt} Tageszeilen.`)
  } else {
    console.log(JSON.stringify(await runMetaZentral(db), null, 2))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
