// Berufsbild bei vorqualifizierten Kandidaten ohne Berufsbild nachziehen (Paket 42) - es
// ist Pflicht fürs Matching. Gemeint ist die Qualifikation der Person, nicht die Stelle,
// auf die sie sich beworben hat:
// 1. Eindeutige Angabe im Zusatzfeld "Ausbildung" - bei mehreren Abschlüssen der höchste;
//    laufende Aus-/Fortbildungen ("zur Steuerfachwirtin") entscheidet die KI.
// 2. Sonst per KI aus Ausbildung, Beschreibung, weiteren Antworten und - nur als Hinweis -
//    der Leadtable-Kampagne. Keine der vier Kernqualifikationen -> "sonstige".
// Je Kandidat ein Verlaufseintrag, danach Matching neu.
//
//   npx tsx scripts/berufsbild-nachziehen.ts               Probelauf (zeigt Ergebnis)
//   npx tsx scripts/berufsbild-nachziehen.ts --ausfuehren  schreibt in die Datenbank
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { berufsbildLabel, type BerufsbildOption } from "../src/lib/berufsbild"
import { fetchBerufsbilder } from "../src/lib/berufsbild-db"
import { generateText } from "../src/lib/llm"
import { matchCandidateToCampaigns } from "../src/lib/matching"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const BATCH = 20
const CACHE = path.resolve(__dirname, "../neuimport/leadtable-cache.json")

interface Row {
  id: string
  custom_fields: Record<string, string> | null
  notes: string | null
  leadtable_lead_id: string | null
}

// Leadtable-Kampagne je Lead aus dem Neuimport-Cache (falls vorhanden).
function leadtableCampaigns(): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(CACHE)) return map
  const customers = JSON.parse(fs.readFileSync(CACHE, "utf8")) as { campaigns: { occupation?: string; leads: { _id: string }[] }[] }[]
  for (const c of customers) for (const k of c.campaigns) for (const l of k.leads) if (k.occupation) map.set(l._id, k.occupation)
  return map
}

// Reihenfolge = Rang (höchster Abschluss zuerst).
const RANKED: [string, RegExp][] = [
  ["steuerberater", /steuerberater(in)?\b/],
  ["steuerfachwirt", /steuerfachwirt/],
  ["bilanzbuchhalter", /bilanzbuchhalter/],
  ["lohnbuchhalter", /lohn(- und gehalts)?buchhalter/],
  ["finanzbuchhalter", /finanzbuchhalter|\bfibu\b/],
  ["steuerfachangestellte", /steuerfach(fach)?angestellte|steuerfachgehilf|fachangestellte[r]? für steuern|\bstfa\b/],
]
const IN_PROGRESS = /\b(zur|zum|angehend|in ausbildung|azubi|auszubildend|umschulung|studium|studiere)/

function berufsbildFromAusbildung(text: string | undefined): string | null {
  const t = (text ?? "").toLowerCase()
  if (!t || IN_PROGRESS.test(t)) return null
  return RANKED.find(([, re]) => re.test(t))?.[0] ?? null
}

function describe(r: Row, campaign: string | undefined): string {
  const cf = r.custom_fields ?? {}
  return [
    cf.ausbildung && `Ausbildung: ${cf.ausbildung}`,
    cf.bevorzugter_bereich && `Bevorzugter Bereich: ${cf.bevorzugter_bereich}`,
    cf.datev_erfahrung && `DATEV: ${cf.datev_erfahrung}`,
    cf.aktuelle_steuerkanzlei && `Arbeitet in Steuerkanzlei: ${cf.aktuelle_steuerkanzlei}`,
    cf.weitere_antworten && `Weitere Antworten: ${cf.weitere_antworten.slice(0, 600)}`,
    r.notes && `Beschreibung: ${r.notes.slice(0, 1200)}`,
    campaign && `Beworben über Kampagne (nur Hinweis): ${campaign}`,
  ]
    .filter(Boolean)
    .join("\n")
}

async function classify(items: { id: string; text: string }[], options: BerufsbildOption[]): Promise<Map<string, string>> {
  const values = new Set(options.filter((o) => o.active !== false).map((o) => o.value))
  const answer = await generateText({
    tier: "fast",
    system:
      "Du ordnest Bewerber für Steuerkanzleien einem Berufsbild zu. Maßgeblich ist die tatsächliche Qualifikation der Person, nicht die Stelle, auf die sie sich beworben hat.",
    prompt: [
      "Berufsbilder:",
      "- steuerfachangestellte: abgeschlossene Ausbildung Steuerfachangestellte/r (auch Steuerfachgehilfe), ohne höhere Fortbildung",
      "- steuerfachwirt: Fortbildung Steuerfachwirt/in",
      "- bilanzbuchhalter: geprüfte/r Bilanzbuchhalter/in",
      "- steuerberater: bestellte/r Steuerberater/in",
      "- finanzbuchhalter: Finanzbuchhalter/in (Ausbildung, Weiterbildung oder mehrjährige Praxis in der Finanzbuchhaltung) ohne die obigen Abschlüsse",
      "- lohnbuchhalter: Lohn- und Gehaltsbuchhalter/in (Weiterbildung oder mehrjährige Praxis in der Lohnabrechnung) ohne die obigen Abschlüsse",
      ...options
        .filter((o) => o.active !== false && !["steuerfachangestellte", "steuerfachwirt", "bilanzbuchhalter", "steuerberater", "finanzbuchhalter", "lohnbuchhalter", "sonstige"].includes(o.value))
        .map((o) => `- ${o.value}: ${o.label}`),
      "- sonstige: alles andere (z. B. Bürokaufleute ohne Buchhaltungspraxis, Quereinsteiger, Auszubildende, Studierende)",
      "Bei mehreren Abschlüssen gilt der höchste. Im Zweifel oder ohne Angaben: sonstige.",
      "",
      ...items.map((it) => `### ${it.id}\n${it.text || "(keine Angaben)"}`),
      "",
      'Antworte nur mit JSON: {"<id>": "<berufsbild>", ...} für alle IDs.',
    ].join("\n"),
    maxTokens: 2000,
    timeoutMs: 120_000,
  })
  const match = answer.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("KI-Antwort ohne JSON")
  const parsed = JSON.parse(match[0]) as Record<string, string>
  return new Map(Object.entries(parsed).filter(([, v]) => values.has(v)))
}

async function main() {
  const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const { data, error } = await db
    .from("candidates")
    .select("id, custom_fields, notes, leadtable_lead_id")
    .eq("status", "vorqualifiziert")
    .eq("is_demo", false)
    .is("berufsbild", null)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Row[]
  console.log(EXECUTE ? "MODUS: AUSFÜHREN" : "MODUS: Probelauf")
  console.log(`Vorqualifiziert ohne Berufsbild: ${rows.length}`)

  const campaigns = leadtableCampaigns()
  const options = await fetchBerufsbilder(db)
  const result = new Map<string, { value: string; via: string }>()
  const open: { id: string; text: string }[] = []
  for (const r of rows) {
    const byField = berufsbildFromAusbildung(r.custom_fields?.ausbildung)
    if (byField) result.set(r.id, { value: byField, via: "Angabe „Ausbildung“" })
    else open.push({ id: r.id, text: describe(r, r.leadtable_lead_id ? campaigns.get(r.leadtable_lead_id) : undefined) })
  }
  for (let i = 0; i < open.length; i += BATCH) {
    const batch = open.slice(i, i + BATCH)
    const answers = await classify(batch, options)
    for (const it of batch) result.set(it.id, { value: answers.get(it.id) ?? "sonstige", via: "KI-Einschätzung" })
    console.log(`KI: ${Math.min(i + BATCH, open.length)}/${open.length}`)
  }

  const stats: Record<string, number> = {}
  for (const { value, via } of result.values()) stats[`${value} (${via})`] = (stats[`${value} (${via})`] ?? 0) + 1
  console.log(stats)
  if (!EXECUTE) return

  let done = 0
  for (const [id, { value, via }] of result) {
    const label = berufsbildLabel(value, options)
    const { error: updateError } = await db.from("candidates").update({ berufsbild: value }).eq("id", id).is("berufsbild", null)
    if (updateError) {
      console.error(id, updateError.message)
      continue
    }
    await db.from("candidate_history").insert({ candidate_id: id, type: "note", content: `Berufsbild ergänzt: ${label} (${via}).` })
    await matchCandidateToCampaigns(db, id).catch((e) => console.error("Matching", id, e))
    done++
  }
  console.log(`Berufsbild gesetzt: ${done}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
