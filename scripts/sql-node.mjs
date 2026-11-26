// Node-Ersatz für psql in scripts/sql.sh (Paket 117): Auf dem neuen Mac fehlt psql, sql.sh
// ruft dann dieses Skript mit denselben Argumenten auf. Gleiche Regeln wie sql.sh:
//   - Live nur Migrationen, die genau so in origin/main liegen (Merge = Freigabe),
//   - Abfragen (-c) auf Live in einer nur-lesenden Sitzung,
//   - jede Migration in EINER Transaktion, mit Prüfsumme in kw_meta.migrationen.
// Verbindung: STAGING_DB_URL / LIVE_DB_URL aus .env.db (nie aus .env.local).
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
process.chdir(root)
const fail = (m) => {
  console.error(`ABBRUCH: ${m}`)
  process.exit(1)
}

const [ziel, aktion, extra] = process.argv.slice(2)
const ZIELE = { staging: ["STAGING_DB_URL", ".env.staging"], live: ["LIVE_DB_URL", ".env.local"] }
if (!ZIELE[ziel] || !aktion) fail("Aufruf: bash scripts/sql.sh <staging|live> <datei.sql|status|baseline|-c \"select …\">")
const [variable, envfile] = ZIELE[ziel]

const wert = (datei, name) => {
  if (!existsSync(datei)) fail(`${datei} fehlt`)
  const zeile = readFileSync(datei, "utf8").split("\n").filter((z) => z.startsWith(`${name}=`)).pop()
  return zeile ? zeile.slice(name.length + 1).replace(/^"(.*)"$/, "$1") : ""
}
const url = wert(".env.db", variable)
if (!url) fail(`${variable} fehlt in .env.db`)
// Gehört die Verbindung wirklich zum Projekt dieser Umgebung? (Schutz vor vertauschten Adressen)
const erwartet = (wert(envfile, "NEXT_PUBLIC_SUPABASE_URL").match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1]
const ref = (url.match(/^postgres(?:ql)?:\/\/postgres\.([a-z0-9]+):/) ?? [])[1]
if (!erwartet || ref !== erwartet) fail(`${variable} gehört nicht zum ${ziel}-Projekt (erwartet ${erwartet}).`)

const pruefsumme = (text) => createHash("sha256").update(text).digest("hex")
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()

async function ensureMeta() {
  await client.query(`set client_min_messages = warning; create schema if not exists kw_meta;
    revoke all on schema kw_meta from public, anon, authenticated;
    create table if not exists kw_meta.migrationen (
      datei text primary key,
      pruefsumme text not null,
      eingespielt_am timestamptz not null default now()
    );`)
}

try {
  if (aktion === "-c") {
    if (!extra) fail("Abfrage fehlt")
    if (ziel === "live") await client.query("set default_transaction_read_only = on")
    const res = await client.query(extra)
    for (const r of Array.isArray(res) ? res : [res]) if (r.rows?.length) console.table(r.rows)
    else if (r.command) console.log(`${r.command} ${r.rowCount ?? ""}`.trim())
  } else if (aktion === "status") {
    await ensureMeta()
    const { rows } = await client.query("select datei from kw_meta.migrationen")
    const da = new Set(rows.map((r) => r.datei))
    const offen = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql") && !da.has(f)).sort()
    for (const f of offen) console.log(`offen: supabase/migrations/${f}`)
    console.log(`${ziel}: ${da.size} eingespielt, ${offen.length} offen.`)
  } else if (aktion === "baseline") {
    fail("baseline bitte nur mit psql (einmalig, ist erledigt).")
  } else {
    const datei = aktion
    if (!existsSync(datei) || !datei.startsWith("supabase/migrations/") || !datei.endsWith(".sql")) fail(`Erwartet eine Datei unter supabase/migrations/: ${datei}`)
    const name = path.basename(datei)
    const text = readFileSync(datei, "utf8")
    if (ziel === "live") {
      execFileSync("git", ["fetch", "-q", "origin", "main"])
      let gemergt
      try {
        gemergt = execFileSync("git", ["show", `origin/main:${datei}`], { maxBuffer: 50e6 })
      } catch {
        fail(`${name} ist noch nicht in main gemergt - auf Live erst nach dem Merge.`)
      }
      if (pruefsumme(gemergt) !== pruefsumme(text)) fail(`${name} weicht lokal von main ab - auf Live läuft nur der gemergte Stand.`)
    }
    await ensureMeta()
    const summe = pruefsumme(text)
    const { rows } = await client.query("select pruefsumme from kw_meta.migrationen where datei = $1", [name])
    if (rows.length) {
      if (rows[0].pruefsumme === summe) {
        console.log(`${ziel}: ${name} ist schon eingespielt.`)
        process.exit(0)
      }
      fail(`${name} wurde auf ${ziel} mit anderem Inhalt eingespielt - Änderungen als neue Migration anlegen.`)
    }
    if (extra === "--ohne-transaktion") {
      await client.query(text)
    } else {
      await client.query("begin")
      try {
        await client.query(text)
      } catch (err) {
        await client.query("rollback")
        throw err
      }
    }
    await client.query("insert into kw_meta.migrationen (datei, pruefsumme) values ($1, $2)", [name, summe])
    if (extra !== "--ohne-transaktion") await client.query("commit")
    console.log(`${ziel}: ${name} eingespielt.`)
  }
} catch (err) {
  console.error(`FEHLER: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
