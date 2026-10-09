// Werdegang für den Lebenslauf bei allen vorqualifizierten Kandidaten ohne Werdegang per KI
// erzeugen (Paket 43) - dieselbe Logik wie "Mit KI anreichern" im Profil. Etwa eine Minute
// je Kandidat, 5 parallel. Mehrfach ausführbar (vorhandene Werdegänge bleiben).
//
//   npx tsx scripts/werdegang-anreichern.ts               Probelauf (zählt nur)
//   npx tsx scripts/werdegang-anreichern.ts --ausfuehren
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { generateWerdegang } from "../src/lib/cv-werdegang"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const PARALLEL = 5

async function main() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db.from("candidates").select("id").eq("status", "vorqualifiziert").eq("is_demo", false).is("cv_werdegang", null)
  if (error) throw new Error(error.message)
  const ids = (data ?? []).map((r) => r.id)
  console.log(`Vorqualifiziert ohne Werdegang: ${ids.length}`)
  if (!EXECUTE) return

  let next = 0
  let done = 0
  let failed = 0
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < ids.length) {
        const id = ids[next++]
        try {
          await generateWerdegang(db, id)
          done++
        } catch (err) {
          failed++
          console.error(id, err instanceof Error ? err.message : err)
        }
        if ((done + failed) % 25 === 0) console.log(`${done + failed}/${ids.length}`)
      }
    })
  )
  console.log(`Fertig: ${done} Werdegänge erstellt, ${failed} Fehler.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
