// Zentraler Meta-Abruf von Hand (Paket 108).
//
//   npx tsx scripts/meta-zentral.ts                 ein Lauf wie der Cron (Konto-Prüfung + letzte Tage)
//   npx tsx scripts/meta-zentral.ts --auffuellen 90 Zahlen pro Anzeige und Tag der letzten 90 Tage
//                                                   nachholen (in 7-Tage-Stücken, mit Pausen)
//   npx tsx scripts/meta-zentral.ts --anzeigen       Texte, Bilder, KI-Einschätzung wie der tägliche Lauf
//                                                   (mit --alle: Details aller Anzeigen neu holen,
//                                                   --ohne-ki: keine Einschätzungen)
//   npx tsx scripts/meta-zentral.ts --uebernahme <anzeigen.json> <einschaetzung.json>
//                                                   Motiv-Typen und Einschätzungen aus dem Testlauf
//                                                   des Meta-Analyse-Tools übernehmen
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
  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "NEXT_PUBLIC_APP_URL"]) {
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

  const { syncMetaAnzeigen } = await import("../src/lib/meta-anzeigen")
  const u = args.indexOf("--uebernahme")
  if (u >= 0) {
    const fs = await import("node:fs")
    const lese = (p: string) => {
      const j = JSON.parse(fs.readFileSync(p, "utf8"))
      return (Array.isArray(j) ? j : j.rows) as Record<string, string>[]
    }
    const anzeigen = lese(args[u + 1])
    const einsch = lese(args[u + 2])
    const { data: da } = await db.from("meta_anzeigen").select("id")
    const vorhanden = new Set(((da ?? []) as { id: string }[]).map((r) => r.id))
    let typen = 0
    for (const a of anzeigen) {
      if (!a.id || !a.typ || !vorhanden.has(a.id)) continue
      const { error } = await db.from("meta_anzeigen").update({ motiv_typ: a.typ }).eq("id", a.id)
      if (error) throw new Error(error.message)
      typen++
    }
    const zeilen = einsch.map((e) => ({
      anzeige_id: e.id,
      bild_urteil: e.bild_urteil,
      bild: e.bild,
      text_urteil: e.text_urteil,
      text: e.text,
      benefits_urteil: e.benefits_urteil,
      benefits: e.benefits,
      fazit: e.fazit,
      modell: "Claude (Testlauf Meta-Analyse-Tool, 10.11.2026)",
    }))
    const { error } = await db.from("meta_einschaetzungen").upsert(zeilen, { onConflict: "anzeige_id" })
    if (error) throw new Error(error.message)
    console.log(`Übernommen: ${typen} Motiv-Typen (von ${anzeigen.length}, Rest ohne Anzeige in Kandidatenwerk), ${zeilen.length} Einschätzungen.`)
    return
  }
  if (args.includes("--anzeigen")) {
    console.log(JSON.stringify(await syncMetaAnzeigen(db, { alle: args.includes("--alle"), ki: !args.includes("--ohne-ki") }), null, 2))
    return
  }
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
