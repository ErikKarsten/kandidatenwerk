// Musterdatensätze deutschlandweit (Paket 62): die Karte soll überall Kandidaten zeigen -
// in Metropolen dicht und mit allen Berufsbildern, auf dem Land vereinzelt.
//
// Dichte nach Einwohnern je Gemeinde (wächst mit der Größe, aber flacher):
//   Orte ab 10.000 Einwohnern: max(2, round(0,0182 · Einwohner^0,517)) Musterdatensätze im
//   Stadtgebiet - z. B. Gifhorn (43 Tsd.) 5, Braunschweig 11, Hannover 16, Frankfurt 20,
//   München 28, Hamburg 32, Berlin 45. Ab 4 je Ort sind alle vier Berufsbilder dabei.
//   Abdeckung: jede Gemeinde hat mindestens 2 Musterdatensätze im 30-km-Umkreis; fehlende
//   kommen in die größte Gemeinde im 15-km-Umkreis.
// Vorhandene Musterdatensätze zählen mit - das Skript ist fortsetzbar.
//
//   npx tsx scripts/muster-deutschland.ts                  Probelauf (Plan und Zahlen)
//   npx tsx scripts/muster-deutschland.ts --ausfuehren     legt an
//   npx tsx scripts/muster-deutschland.ts --ausfuehren --limit=10   nur die ersten 10
//   npx tsx scripts/muster-deutschland.ts --ausfuehren --stichprobe=50   50 über ganz Deutschland verteilt
//
// Einwohnerzahlen: scripts/data/gemeinden.json aus dem Gemeindeverzeichnis (GV-ISys) des
// Statistischen Bundesamts, Stand 31.12.2024 - © Statistisches Bundesamt (Destatis), 2026,
// Datenlizenz Deutschland – Namensnennung – Version 2.0.
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "../src/types/database"
import { fetchBerufsbilder } from "../src/lib/berufsbild-db"
import { geocodePlz, plzWithin } from "../src/lib/geocode-plz"
import { haversineDistanceKm } from "../src/lib/geo-distance"
import { SAMPLE_TAG } from "../src/lib/candidate-tags"
import { generateSamples, insertSampleCandidate, pickNameOrigin, type SamplePerson } from "../src/lib/sample-candidates"
import type { SampleSoftware } from "../src/lib/sample-focus"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const EXECUTE = process.argv.includes("--ausfuehren")
const LIMIT = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? Infinity)
// Stichprobe zum Ansehen: gleichmäßig über den Plan verteilt (Metropolen bis Land).
const SAMPLE_SIZE = Number(process.argv.find((a) => a.startsWith("--stichprobe="))?.split("=")[1] ?? 0)
const BATCH = 5
const PARALLEL = 4

const MIN_TOWN = 10_000
const COVER_RADIUS_KM = 30
const COVER_MIN = 2
// Berufsbilder der Musterdatensätze und ihr Anteil.
const SHARES: [string, number][] = [
  ["steuerfachangestellte", 0.4],
  ["finanzbuchhalter", 0.25],
  ["lohnbuchhalter", 0.2],
  ["steuerfachwirt", 0.15],
]
const SOFTWARE: [SampleSoftware, number][] = [
  ["DATEV", 0.8],
  ["ADDISON", 0.1],
  ["Agenda", 0.1],
]
const ALLROUNDER_SHARE = 0.3

interface Gemeinde {
  name: string
  ew: number
  plz: string
  lat: number
  lng: number
  km2: number
}

interface Slot {
  lat: number
  lng: number
  plz: string
  berufsbild: string
  ort: string
  grund: "ort" | "abdeckung"
}

const db = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

// Reproduzierbarer Zufall (gleicher Datenstand -> gleicher Plan im Probelauf und beim Anlegen).
let seed = 62
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function weighted<T>(items: [T, number][]): T {
  let r = random() * items.reduce((s, [, w]) => s + w, 0)
  for (const [item, w] of items) {
    r -= w
    if (r < 0) return item
  }
  return items[0][0]
}

function townTarget(ew: number): number {
  return ew >= MIN_TOWN ? Math.max(2, Math.round(0.0182 * ew ** 0.517)) : 0
}

// Gewünschte Anzahl je Berufsbild für n Musterdatensätze: ab 4 jedes Berufsbild mindestens
// einmal, der Rest nach Anteilen (größter Rest). Kleine Orte (2-3) ziehen verschiedene
// Berufsbilder zufällig nach Anteil - sonst käme dort nie ein Steuerfachwirt vor.
function berufsbildQuota(n: number): Map<string, number> {
  const quota = new Map(SHARES.map(([bb]) => [bb, 0]))
  if (n < SHARES.length) {
    let pool = [...SHARES]
    for (let i = 0; i < n; i++) {
      const bb = weighted(pool)
      quota.set(bb, 1)
      pool = pool.filter(([x]) => x !== bb)
    }
    return quota
  }
  let rest = n
  for (const [bb] of SHARES) quota.set(bb, 1)
  rest -= SHARES.length
  const exact = SHARES.map(([bb, share]) => ({ bb, value: rest * share }))
  for (const e of exact) quota.set(e.bb, quota.get(e.bb)! + Math.floor(e.value))
  let missing = n - [...quota.values()].reduce((s, v) => s + v, 0)
  for (const e of [...exact].sort((a, b) => (b.value % 1) - (a.value % 1))) {
    if (missing-- <= 0) break
    quota.set(e.bb, quota.get(e.bb)! + 1)
  }
  return quota
}

// Räumlicher Index für "wie viele Musterdatensätze im Umkreis".
class PointIndex {
  private cells = new Map<string, { lat: number; lng: number; berufsbild: string }[]>()
  private key(lat: number, lng: number) {
    return `${Math.floor(lat / 0.25)}:${Math.floor(lng / 0.25)}`
  }
  add(p: { lat: number; lng: number; berufsbild: string }) {
    const k = this.key(p.lat, p.lng)
    if (!this.cells.has(k)) this.cells.set(k, [])
    this.cells.get(k)!.push(p)
  }
  within(lat: number, lng: number, km: number) {
    const out: { lat: number; lng: number; berufsbild: string }[] = []
    const r = Math.ceil(km / 111 / 0.25) + 1
    const ci = Math.floor(lat / 0.25)
    const cj = Math.floor(lng / 0.25)
    for (let i = ci - r; i <= ci + r; i++)
      for (let j = cj - r; j <= cj + r; j++)
        for (const p of this.cells.get(`${i}:${j}`) ?? []) if (haversineDistanceKm(lat, lng, p.lat, p.lng) <= km) out.push(p)
    return out
  }
}

// Wohnort im Stadtgebiet: zufällige PLZ im Umkreis, leicht versetzt (bis ~800 m), damit
// sich die Punkte auf der Karte nicht exakt überlagern.
function placeIn(g: Gemeinde, radiusKm: number): { plz: string; lat: number; lng: number } {
  const pool = plzWithin(g.lat, g.lng, radiusKm)
  const plz = pool.length ? pool[Math.floor(random() * pool.length)] : g.plz
  const base = geocodePlz(plz) ?? { lat: g.lat, lng: g.lng }
  const d = 0.8 * Math.sqrt(random())
  const a = random() * 2 * Math.PI
  return {
    plz: geocodePlz(plz) ? plz : g.plz,
    lat: base.lat + (d / 111) * Math.cos(a),
    lng: base.lng + (d / (111 * Math.cos((base.lat * Math.PI) / 180))) * Math.sin(a),
  }
}

async function loadExistingSamples() {
  const rows: { lat: number | null; lng: number | null; berufsbild: string | null; first_name: string; last_name: string }[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("candidates")
      .select("lat, lng, berufsbild, first_name, last_name")
      .contains("tags", [SAMPLE_TAG])
      .order("id")
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return rows
}

function plan(gemeinden: Gemeinde[], existing: Awaited<ReturnType<typeof loadExistingSamples>>): Slot[] {
  const index = new PointIndex()
  for (const e of existing) if (e.lat !== null && e.lng !== null) index.add({ lat: e.lat, lng: e.lng, berufsbild: e.berufsbild ?? "" })
  const slots: Slot[] = []
  const add = (s: Slot) => {
    slots.push(s)
    index.add(s)
  }

  // 1. Orte ab 10.000 Einwohnern, die größten zuerst.
  for (const g of [...gemeinden].sort((a, b) => b.ew - a.ew)) {
    const target = townTarget(g.ew)
    if (!target) continue
    const radius = Math.min(20, Math.max(3, Math.sqrt(g.km2 / Math.PI)))
    const have = index.within(g.lat, g.lng, radius)
    const quota = berufsbildQuota(target)
    for (const h of have) if (quota.has(h.berufsbild)) quota.set(h.berufsbild, quota.get(h.berufsbild)! - 1)
    let missing = target - have.length
    while (missing-- > 0) {
      // Berufsbild mit dem größten Rückstand.
      const [bb] = [...quota.entries()].sort((a, b) => b[1] - a[1])[0]
      quota.set(bb, quota.get(bb)! - 1)
      add({ ...placeIn(g, radius), berufsbild: bb, ort: g.name, grund: "ort" })
    }
  }

  // 2. Abdeckung: jede Gemeinde mindestens 2 im 30-km-Umkreis.
  const shuffled = [...gemeinden].sort((a, b) => a.plz.localeCompare(b.plz)).map((g) => ({ g, r: random() })).sort((a, b) => a.r - b.r).map((x) => x.g)
  for (const g of shuffled) {
    let have = index.within(g.lat, g.lng, COVER_RADIUS_KM).length
    while (have < COVER_MIN) {
      const host = gemeinden
        .filter((x) => Math.abs(x.lat - g.lat) < 0.2 && Math.abs(x.lng - g.lng) < 0.3 && haversineDistanceKm(g.lat, g.lng, x.lat, x.lng) <= 15)
        .sort((a, b) => b.ew - a.ew)[0] ?? g
      add({ ...placeIn(host, 3), berufsbild: weighted(SHARES), ort: host.name, grund: "abdeckung" })
      have++
    }
  }
  return slots
}

function report(slots: Slot[], gemeinden: Gemeinde[], existingCount: number) {
  const byClass = new Map<string, number>()
  const ewByName = new Map(gemeinden.map((g) => [g.name, g.ew]))
  for (const s of slots) {
    const ew = ewByName.get(s.ort) ?? 0
    const cls = s.grund === "abdeckung" ? "Abdeckung (ländlich)" : ew >= 500_000 ? "Metropolen ab 500 Tsd." : ew >= 100_000 ? "Großstädte 100–500 Tsd." : ew >= 50_000 ? "Mittelstädte 50–100 Tsd." : ew >= 20_000 ? "Kleinstädte 20–50 Tsd." : "Kleinstädte 10–20 Tsd."
    byClass.set(cls, (byClass.get(cls) ?? 0) + 1)
  }
  const byBb = slots.reduce<Record<string, number>>((m, s) => ((m[s.berufsbild] = (m[s.berufsbild] ?? 0) + 1), m), {})
  console.log(`Vorhandene Musterdatensätze: ${existingCount}`)
  console.log(`Neu geplant: ${slots.length}`)
  for (const [cls, n] of [...byClass.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${cls}: ${n}`)
  console.log(`Berufsbilder: ${JSON.stringify(byBb)}`)
  const all = new PointIndex()
  for (const s of slots) all.add(s)
  console.log("Beispiele (geplant im Stadtgebiet / im 30-km-Umkreis):")
  for (const name of ["Berlin, Stadt", "Hamburg, Freie und Hansestadt", "München, Landeshauptstadt", "Frankfurt am Main, Stadt", "Hannover, Landeshauptstadt", "Braunschweig, Stadt", "Gifhorn, Stadt", "Wittingen, Stadt"]) {
    const g = gemeinden.find((x) => x.name === name)
    if (!g) continue
    const ort = slots.filter((s) => s.ort === name).length
    console.log(`  ${name.split(",")[0].padEnd(14)} ${String(g.ew).padStart(9)} Einw. | ${String(ort).padStart(3)} | ${String(all.within(g.lat, g.lng, 30).length).padStart(4)}`)
  }
  const calls = Math.ceil(slots.length / BATCH)
  console.log(`KI-Aufrufe: ${calls} (je ${BATCH} Profile), bei ${PARALLEL} parallel grob ${Math.round((calls * 1.5) / PARALLEL / 60)} Stunden`)
}

async function main() {
  const gemeinden: Gemeinde[] = JSON.parse(fs.readFileSync(path.resolve(__dirname, "data/gemeinden.json"), "utf8"))
  const existing = await loadExistingSamples()
  const slots = plan(gemeinden, existing)
  console.log(`MODUS: ${EXECUTE ? "AUSFÜHREN" : "Probelauf (schreibt nichts)"}`)
  report(slots, gemeinden, existing.length)
  if (!EXECUTE) return

  const labels = new Map((await fetchBerufsbilder(db)).map((o) => [o.value, o.label]))
  const usedNames = new Set(existing.map((e) => `${e.first_name} ${e.last_name}`.toLowerCase()))
  const recentNames: string[] = existing.slice(-40).map((e) => `${e.first_name} ${e.last_name}`)
  const step = SAMPLE_SIZE > 0 ? Math.max(1, Math.floor(slots.length / SAMPLE_SIZE)) : 1
  const todo = (SAMPLE_SIZE > 0 ? slots.filter((_, i) => i % step === 0).slice(0, SAMPLE_SIZE) : slots).slice(0, LIMIT)
  if (SAMPLE_SIZE > 0) console.log(`Stichprobe: ${todo.length} Orte, z. B. ${[...new Set(todo.map((s) => s.ort.split(",")[0]))].slice(0, 12).join(", ")}`)
  // Stapel je Berufsbild, damit ein KI-Aufruf ein Berufsbild bedient.
  const batches: Slot[][] = []
  for (const [bb] of SHARES) {
    const list = todo.filter((s) => s.berufsbild === bb)
    for (let i = 0; i < list.length; i += BATCH) batches.push(list.slice(i, i + BATCH))
  }
  const stats = { angelegt: 0, doppelt: 0, fehler: 0 }
  let next = 0
  const started = Date.now()
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++]
      const people: SamplePerson[] = batch.map((s) => ({
        plz: s.plz,
        geschlecht: random() < 0.5 ? "weiblich" : "männlich",
        herkunft: pickNameOrigin(random),
        software: weighted(SOFTWARE),
        allrounder: random() < ALLROUNDER_SHARE,
      }))
      const label = labels.get(batch[0].berufsbild) ?? batch[0].berufsbild
      let samples
      for (let attempt = 1; ; attempt++) {
        try {
          samples = await generateSamples({ value: batch[0].berufsbild, label }, people, { avoidNames: recentNames.slice(-40) })
          break
        } catch (err) {
          if (attempt >= 2) {
            console.error(`Stapel ${label} (${batch[0].ort}): ${err instanceof Error ? err.message : err}`)
            stats.fehler += batch.length
            samples = null
            break
          }
        }
      }
      if (!samples) continue
      // Unpassende Profile hat generateSamples weggelassen (Paket 71) - Lücken füllt ein neuer Lauf.
      stats.fehler += batch.length - samples.length
      for (const { person, sample: s } of samples) {
        const i = people.indexOf(person)
        const name = `${s.first_name} ${s.last_name}`
        if (usedNames.has(name.toLowerCase())) {
          stats.doppelt++
          continue
        }
        usedNames.add(name.toLowerCase())
        recentNames.push(name)
        try {
          await insertSampleCandidate(db, s, people[i], batch[i].berufsbild, null, { lat: batch[i].lat, lng: batch[i].lng })
          stats.angelegt++
        } catch (err) {
          console.error(`${name}: ${err instanceof Error ? err.message : err}`)
          stats.fehler++
        }
      }
      const minutes = (Date.now() - started) / 60000
      console.log(`${stats.angelegt + stats.doppelt + stats.fehler}/${todo.length} - angelegt ${stats.angelegt}, doppelte Namen ${stats.doppelt}, Fehler ${stats.fehler} (${minutes.toFixed(1)} min)`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  console.log(`Fertig: ${stats.angelegt} angelegt, ${stats.doppelt} wegen doppelter Namen übersprungen, ${stats.fehler} Fehler. Erneut starten füllt Lücken auf.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
