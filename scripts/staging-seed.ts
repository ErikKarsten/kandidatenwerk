// Testdaten für Staging (T-99, aktualisiert Paket 102), nach scripts/staging-setup.sh:
// Admin-Login, eine Testkanzlei mit Portal-Zugang, eine Lead-Kampagne (Herkunft) und eine
// Kanzlei-Kampagne, Kandidaten in typischen Status und Zuordnungen zur Kanzlei in den
// Portal-Status (Neu, Vorstellungsgespräch, Bewerber hat abgesagt).
// Alle Test-E-Mail-Adressen sind Plus-Adressen des Staging-Admins (name+kandidat1@...) -
// Mails aus Staging landen so nur im eigenen Postfach. Mehrfach ausführbar.
//
// Usage: npx tsx scripts/staging-seed.ts   (liest .env.staging, nie .env.local)
import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"
import { createHash, randomBytes } from "node:crypto"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, "../.env.staging"), quiet: true, override: true })
const live = dotenv.config({ path: path.resolve(__dirname, "../.env.local"), quiet: true, processEnv: {} }).parsed

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
const adminEmail = process.env.STAGING_ADMIN_EMAIL
// Optional: ohne Passwort gibt das Skript Links zum Passwort-Setzen aus (Paket 102).
const adminPassword = process.env.STAGING_ADMIN_PASSWORD || undefined
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "<Staging-Adresse>").replace(/\/+$/, "")
if (!url || !key || !adminEmail) throw new Error("Werte in .env.staging fehlen (siehe .env.staging.example)")
if (live?.NEXT_PUBLIC_SUPABASE_URL === url) throw new Error(".env.staging zeigt auf die Live-Datenbank - Abbruch.")

const db = createClient(url, key, { auth: { persistSession: false } })
const plus = (tag: string) => adminEmail.replace("@", `+${tag}@`)

async function ensureUser(email: string, password?: string): Promise<string> {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
  const found = list?.users.find((u) => u.email === email)
  if (found) return found.id
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`Login ${email}: ${error?.message}`)
  return data.user.id
}

// Gleiches Verfahren wie src/lib/password-link.ts: in der Datenbank nur der Hash, ein neuer
// Link ersetzt den alten.
async function passwordLink(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await db.from("password_links").delete().eq("user_id", userId).is("used_at", null)
  const { error } = await db.from("password_links").insert({ user_id: userId, token_hash: createHash("sha256").update(token).digest("hex") })
  if (error) throw new Error(`Passwort-Link: ${error.message}`)
  return `${appUrl}/passwort-setzen/${token}`
}

async function main() {
  const { data: agency } = await db.from("agencies").select("id, name").order("created_at").limit(1).maybeSingle()
  if (!agency) throw new Error("Keine Agentur - zuerst scripts/staging-setup.sh ausführen.")

  const adminId = await ensureUser(adminEmail!, adminPassword)
  await db.from("profiles").upsert({ id: adminId, agency_id: agency.id, role: "agency_admin", full_name: "Staging Admin", email: adminEmail })

  let { data: client } = await db.from("clients").select("id").eq("name", "Staging Musterkanzlei").maybeSingle()
  if (!client) {
    const res = await db
      .from("clients")
      .insert({ agency_id: agency.id, name: "Staging Musterkanzlei", contact_email: plus("kanzlei"), plz: "53111", ort: "Bonn", key_account_manager_id: adminId })
      .select("id")
      .single()
    if (res.error) throw new Error(res.error.message)
    client = res.data
  }
  const portalId = await ensureUser(plus("kanzlei"), adminPassword)
  await db.from("profiles").upsert({ id: portalId, agency_id: null, client_id: client.id, role: "client", full_name: "Kanzlei Test", email: plus("kanzlei") })

  let { data: campaign } = await db.from("campaigns").select("id").eq("client_id", client.id).eq("kind", "kanzlei").limit(1).maybeSingle()
  if (!campaign) {
    const res = await db
      .from("campaigns")
      .insert({ agency_id: agency.id, client_id: client.id, kind: "kanzlei", title: "Steuerfachangestellte Bonn (Staging)", berufsbild: "steuerfachangestellte", plz: "53111", radius_km: 30 })
      .select("id")
      .single()
    if (res.error) throw new Error(`Kanzlei-Kampagne: ${res.error.message}`)
    campaign = res.data
  }

  let { data: leadCampaign } = await db.from("campaigns").select("id").eq("kind", "lead").eq("title", "Meta-Leads Bonn (Staging)").maybeSingle()
  if (!leadCampaign) {
    const res = await db
      .from("campaigns")
      .insert({ agency_id: agency.id, kind: "lead", title: "Meta-Leads Bonn (Staging)", berufsbild: "steuerfachangestellte", plz: "53111", radius_km: 30 })
      .select("id")
      .single()
    if (res.error) throw new Error(`Lead-Kampagne: ${res.error.message}`)
    leadCampaign = res.data
  }

  // assignment: Status der Zuordnung zur Testkanzlei (null = nicht zugeordnet)
  const candidates = [
    { tag: "kandidat1", first_name: "Anna", last_name: "Neu", status: "neu", assignment: null },
    { tag: "kandidat2", first_name: "Ben", last_name: "Vorqualifiziert", status: "vorqualifiziert", assignment: "inbox" },
    { tag: "kandidat3", first_name: "Clara", last_name: "Kontakt", status: "in_kontakt", assignment: "vg" },
    { tag: "kandidat4", first_name: "David", last_name: "Absage", status: "in_kontakt", assignment: "abgesagt" },
    { tag: "kandidat5", first_name: "Eva", last_name: "Pruefung", status: "in_pruefung", assignment: null },
  ]
  for (const c of candidates) {
    const email = plus(c.tag)
    let { data: candidate } = await db.from("candidates").select("id").eq("email", email).maybeSingle()
    if (!candidate) {
      const { data: inserted, error } = await db
        .from("candidates")
        .insert({
          campaign_id: leadCampaign.id,
          first_name: c.first_name,
          last_name: c.last_name,
          email,
          phone: "+49 228 000000",
          status: c.status,
          source: "manual",
          berufsbild: "steuerfachangestellte",
          plz: "53111",
          custom_fields: { verfuegbar_ab: "sofort", wechselgrund: "Testdaten für Staging" },
        })
        .select("id")
        .single()
      if (error) throw new Error(`${c.first_name}: ${error.message}`)
      candidate = inserted
    }
    if (!c.assignment) continue
    const { data: assigned } = await db
      .from("client_assignments")
      .select("id")
      .eq("candidate_id", candidate.id)
      .eq("campaign_id", campaign.id)
      .is("removed_at", null)
      .maybeSingle()
    if (assigned) continue
    const { error: assignError } = await db
      .from("client_assignments")
      .insert({ candidate_id: candidate.id, campaign_id: campaign.id, client_id: client.id, status: c.assignment, created_by: adminId })
    if (assignError) throw new Error(`Zuordnung ${c.first_name}: ${assignError.message}`)
  }
  console.log(`Staging bereit: Admin ${adminEmail}, Portal ${plus("kanzlei")}, ${candidates.length} Testkandidaten.`)
  if (!adminPassword) {
    console.log(`Passwort setzen - Admin:  ${await passwordLink(adminId)}`)
    console.log(`Passwort setzen - Portal: ${await passwordLink(portalId)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
