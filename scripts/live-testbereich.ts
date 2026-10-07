// Testbereich auf Live (bis zum Launch statt Staging, Entscheidung 07.10.2026): legt eine
// Testkanzlei mit Portal-Zugang, eine Testkampagne, drei Testkandidaten und einen
// Test-Mitarbeiter an. Alle Adressen sind Plus-Adressen der angegebenen E-Mail
// (name+kw-test-...@...) - Mails landen nur im eigenen Postfach. scripts/live-bereinigen.ts
// entfernt alles wieder. Mehrfach ausführbar.
//
// Die Zugänge für die E2E-Tests werden in .env.local ergänzt (E2E_ADMIN_*, E2E_PORTAL_*).
//
// Usage: npx tsx scripts/live-testbereich.ts name@firma.de
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envFile = path.resolve(__dirname, "../.env.local")
dotenv.config({ path: envFile, quiet: true })

const base = process.argv[2]
if (!base || !/^[^@+\s]+@[^@\s]+\.[a-z]{2,}$/i.test(base)) throw new Error("Usage: npx tsx scripts/live-testbereich.ts name@firma.de")
const plus = (tag: string) => base.replace("@", `+kw-test-${tag}@`)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
const CLIENT_NAME = "TEST Musterkanzlei"

async function ensureUser(email: string, password: string): Promise<string> {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
  const found = list?.users.find((u) => u.email === email)
  if (found) {
    await db.auth.admin.updateUserById(found.id, { password })
    return found.id
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Zugang ${email}: ${error?.message}`)
  return data.user.id
}

function setEnv(values: Record<string, string>) {
  let text = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : ""
  for (const [k, v] of Object.entries(values)) {
    const line = `${k}=${v}`
    text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), line) : `${text.trimEnd()}\n${line}\n`
  }
  fs.writeFileSync(envFile, text)
}

async function main() {
  const { data: agency } = await db.from("agencies").select("id").order("created_at").limit(1).single()
  if (!agency) throw new Error("Keine Agentur gefunden.")
  const password = crypto.randomBytes(12).toString("base64url")

  const teamId = await ensureUser(plus("team"), password)
  await db.from("profiles").upsert({ id: teamId, agency_id: agency.id, role: "agency_member", full_name: "Test Mitarbeiter", email: plus("team") })

  let { data: client } = await db.from("clients").select("id").eq("name", CLIENT_NAME).maybeSingle()
  if (!client) {
    const res = await db
      .from("clients")
      .insert({ agency_id: agency.id, name: CLIENT_NAME, contact_email: plus("kanzlei"), plz: "53111", ort: "Bonn", key_account_manager_id: teamId })
      .select("id")
      .single()
    if (res.error) throw new Error(res.error.message)
    client = res.data
  }
  const portalId = await ensureUser(plus("kanzlei"), password)
  await db.from("profiles").upsert({ id: portalId, agency_id: null, client_id: client.id, role: "client", full_name: "Test Kanzlei", email: plus("kanzlei") })

  let { data: campaign } = await db.from("campaigns").select("id").eq("client_id", client.id).eq("title", "TEST Steuerfachangestellte Bonn").maybeSingle()
  if (!campaign) {
    const res = await db
      .from("campaigns")
      .insert({ agency_id: agency.id, client_id: client.id, kind: "kanzlei", title: "TEST Steuerfachangestellte Bonn", berufsbild: "steuerfachangestellte", plz: "53111", radius_km: 30 })
      .select("id")
      .single()
    if (res.error) throw new Error(res.error.message)
    campaign = res.data
  }

  const candidates = [
    { tag: "kandidat1", first_name: "Anna", last_name: "Neu", status: "neu", assign: false },
    { tag: "kandidat2", first_name: "Ben", last_name: "Vorqualifiziert", status: "vorqualifiziert", assign: true },
    { tag: "kandidat3", first_name: "Clara", last_name: "Kontakt", status: "in_kontakt", assign: false },
  ]
  for (const c of candidates) {
    const email = plus(c.tag)
    let { data: row } = await db.from("candidates").select("id").eq("email", email).maybeSingle()
    if (!row) {
      const res = await db
        .from("candidates")
        .insert({
          campaign_id: campaign.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email,
          phone: "+49 228 000000",
          status: c.status,
          source: "manual",
          berufsbild: "steuerfachangestellte",
          plz: "53111",
          custom_fields: { verfuegbar_ab: "sofort", wechselgrund: "Testdaten" },
        })
        .select("id")
        .single()
      if (res.error) throw new Error(`${c.first_name}: ${res.error.message}`)
      row = res.data
    }
    if (c.assign) {
      const { data: existing } = await db.from("client_assignments").select("id").eq("candidate_id", row.id).eq("client_id", client.id).maybeSingle()
      if (!existing) {
        const { error } = await db.from("client_assignments").insert({ candidate_id: row.id, client_id: client.id, campaign_id: campaign.id, created_by: teamId })
        if (error) throw new Error(`Zuordnung: ${error.message}`)
      }
    }
  }

  setEnv({ E2E_ADMIN_EMAIL: plus("team"), E2E_ADMIN_PASSWORD: password, E2E_PORTAL_EMAIL: plus("kanzlei"), E2E_PORTAL_PASSWORD: password })
  console.log(`Testbereich bereit: ${CLIENT_NAME}, 3 Testkandidaten (Ben ist zugeordnet), Zugänge ${plus("team")} und ${plus("kanzlei")}.`)
  console.log("Passwörter stehen in .env.local (E2E_*).")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
