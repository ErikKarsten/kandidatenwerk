// Live-Datenbank vor dem Launch leeren (Entscheidung 07.10.2026): löscht alle Kandidaten,
// Kunden, Kampagnen, Zuordnungen, Aufgaben, Mails, Verläufe, Portal-Zugänge und deren
// Dateien. Bleibt: Agentur, Team, E-Mail-Vorlagen und Sets, Felder, Textbausteine, Logo,
// Meta-Lead-Formulare, PLZ-Bereiche, Fehlermeldungen (ohne Kundenbezug), Cron-Protokoll.
//
// Vorher wird alles Gelöschte (Tabellen als JSON, Dateien) nach
// ~/Kandidatenwerk-Sicherungen/<Zeitpunkt>/ gesichert - außerhalb des Repos, enthält
// Personendaten: verschlüsselt ablegen und nach der Aufbewahrungsfrist löschen.
//
// Nach dem Lauf legt der stündliche Meta-Kampagnen-Abgleich die Lead-Kampagnen aus dem
// Werbekonto neu an (ohne Kunden); Meta-Leads kommen nur noch aus den letzten 3 Tagen,
// Kanzleistelle24-Bewerbungen gar nicht erneut (dort als übernommen markiert).
//
// Usage:
//   npx tsx scripts/live-bereinigen.ts                         # Probelauf: zeigt nur Anzahlen
//   BESTAETIGUNG=LIVE-LEEREN npx tsx scripts/live-bereinigen.ts --ausfuehren
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true })

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const execute = process.argv.includes("--ausfuehren")

// Reihenfolge: abhängige Tabellen zuerst. Schlägt eine Löschung an einem Fremdschlüssel
// fehl, wird sie in der nächsten Runde wiederholt.
const DELETE_TABLES = [
  "campaign_automation_runs",
  "candidate_mail_runs",
  "candidate_messages",
  "candidate_history",
  "candidate_files",
  "candidate_campaign_matches",
  "client_assignment_notes",
  "client_assignments",
  "custom_field_review_queue",
  "duplicate_cases",
  "tasks",
  "close_meeting_summaries",
  "client_files",
  "client_comments",
  "client_contacts",
  "client_positions",
  "client_profiles",
  "client_locations",
  "campaign_automations",
  "campaign_ad_areas",
  "candidates",
  "campaigns",
  "clients",
  "leadtable_sync_runs",
]
// Spalte, die in jeder Zeile gesetzt ist (PostgREST verlangt einen Filter beim Löschen).
const KEY_COLUMN: Record<string, string> = {}
const DELETE_BUCKETS = ["candidate-files", "client-files", "client-logos"]
// Team-Konten mit dieser Kennung sind Testzugänge (scripts/live-testbereich.ts).
const TEST_TAG = "+kw-test"

async function count(table: string): Promise<number> {
  const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true })
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

async function fetchAll(table: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select("*").range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function listFiles(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset })
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`)
    for (const item of data ?? []) {
      const p = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) out.push(...(await listFiles(bucket, p)))
      else out.push(p)
    }
    if (!data || data.length < 100) return out
  }
}

async function portalAndTestUsers() {
  const { data, error } = await db.from("profiles").select("id, email, role, full_name")
  if (error) throw new Error(error.message)
  return (data ?? []).filter((p) => p.role === "client" || (p.email ?? "").includes(TEST_TAG))
}

async function main() {
  const { data: agency } = await db.from("agencies").select("name").limit(1).maybeSingle()
  console.log(`Live-Datenbank: ${process.env.NEXT_PUBLIC_SUPABASE_URL} (Agentur: ${agency?.name ?? "?"})`)
  console.log(execute ? "MODUS: AUSFÜHREN\n" : "MODUS: Probelauf (nichts wird gelöscht)\n")

  const counts: Record<string, number> = {}
  for (const t of DELETE_TABLES) counts[t] = await count(t)
  for (const t of DELETE_TABLES) console.log(`  ${t.padEnd(30)} ${String(counts[t]).padStart(6)}`)
  const users = await portalAndTestUsers()
  console.log(`  ${"Portal- und Testzugänge".padEnd(30)} ${String(users.length).padStart(6)}`)
  const files: Record<string, string[]> = {}
  for (const b of DELETE_BUCKETS) {
    files[b] = await listFiles(b)
    console.log(`  ${("Dateien " + b).padEnd(30)} ${String(files[b].length).padStart(6)}`)
  }

  if (!execute) {
    console.log("\nBleibt erhalten: Agentur, Team, Vorlagen, Sets, Felder, Textbausteine, Logo, Meta-Formulare.")
    console.log("Ausführen: BESTAETIGUNG=LIVE-LEEREN npx tsx scripts/live-bereinigen.ts --ausfuehren")
    return
  }
  if (process.env.BESTAETIGUNG !== "LIVE-LEEREN") throw new Error("BESTAETIGUNG=LIVE-LEEREN fehlt - Abbruch.")

  // 1. Sicherung
  const dir = path.join(os.homedir(), "Kandidatenwerk-Sicherungen", new Date().toISOString().replace(/[:.]/g, "-"))
  fs.mkdirSync(path.join(dir, "dateien"), { recursive: true })
  for (const t of DELETE_TABLES) fs.writeFileSync(path.join(dir, `${t}.json`), JSON.stringify(await fetchAll(t)))
  fs.writeFileSync(path.join(dir, "zugaenge.json"), JSON.stringify(users))
  for (const [bucket, paths] of Object.entries(files)) {
    for (const p of paths) {
      const { data, error } = await db.storage.from(bucket).download(p)
      if (error || !data) throw new Error(`Sicherung ${bucket}/${p}: ${error?.message}`)
      const target = path.join(dir, "dateien", bucket, p)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, Buffer.from(await data.arrayBuffer()))
    }
  }
  console.log(`\nSicherung: ${dir}`)

  // 2. Tabellen leeren (mehrere Runden wegen Fremdschlüsseln)
  let pending = DELETE_TABLES.filter((t) => counts[t] > 0)
  for (let round = 1; pending.length && round <= 5; round++) {
    const failed: string[] = []
    for (const t of pending) {
      const { error } = await db.from(t).delete().not(KEY_COLUMN[t] ?? "id", "is", null)
      if (error) {
        failed.push(t)
        if (round === 5) console.error(`  ${t}: ${error.message}`)
      }
    }
    pending = failed
  }
  if (pending.length) throw new Error(`Nicht geleert: ${pending.join(", ")}`)

  // 3. Portal- und Testzugänge
  for (const u of users) {
    await db.from("profiles").delete().eq("id", u.id)
    const { error } = await db.auth.admin.deleteUser(u.id)
    if (error && !/not found/i.test(error.message)) throw new Error(`Zugang ${u.email}: ${error.message}`)
  }

  // 4. Dateien
  for (const [bucket, paths] of Object.entries(files)) {
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100))
      if (error) throw new Error(`${bucket}: ${error.message}`)
    }
  }

  console.log("\nFertig. Restbestand:")
  for (const t of DELETE_TABLES) {
    const n = await count(t)
    if (n) console.log(`  ${t}: ${n} (vermutlich während des Laufs neu hinzugekommen)`)
  }
  console.log(`  Portal- und Testzugänge: ${(await portalAndTestUsers()).length}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
