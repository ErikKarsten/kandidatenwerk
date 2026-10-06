// Kunde und gesuchte Stellen aus dem Kanzleiprofil zu Kanzleistelle24 (Paket 16, T-52).
//
// Die Firma bekommt das "Intro zur Kanzlei" als Beschreibung, jede gesuchte Stelle wird
// eine Stellenanzeige mit festem Aufbau (Über uns = Intro, Ihre Aufgaben, Ihr Profil,
// Das bieten wir). Erstes Veröffentlichen per Knopf (nur bei abgeschlossenem Profil),
// danach überträgt syncKanzleistelleIfPublished Änderungen automatisch. Die alte,
// kampagnenbasierte Veröffentlichung (sync-kanzleistelle-jobs.ts) bleibt für Bestände.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Db = SupabaseClient<Database>

type Position = Database["public"]["Tables"]["client_positions"]["Row"]
type Profile = Database["public"]["Tables"]["client_profiles"]["Row"]

function kanzleistelle() {
  return createClient(process.env.KANZLEISTELLE_SUPABASE_URL!, process.env.KANZLEISTELLE_SUPABASE_SERVICE_KEY!)
}

function kandidatenwerk(): Db {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)
}

const t = (v: string | null | undefined) => (v ?? "").trim()

// "45.000–52.000 € brutto/Jahr" -> 45000/52000; "ab 3.500 € im Monat" -> 42000 (x12).
export function parseSalary(text: string | null | undefined): { min: number | null; max: number | null } {
  const raw = t(text)
  if (!raw) return { min: null, max: null }
  const numbers = [...raw.matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d+)?\s*(k|tsd)?/gi)]
    .map((m) => Number(m[1].replace(/[.\s]/g, "")) * (m[2] ? 1000 : 1))
    .filter((n) => n >= 1000)
  if (numbers.length === 0) return { min: null, max: null }
  const monthly = /monat|mtl/i.test(raw) && Math.max(...numbers) < 15000
  const values = numbers.map((n) => (monthly ? n * 12 : n))
  return { min: Math.min(...values), max: values.length > 1 ? Math.max(...values) : null }
}

export function employmentType(arbeitszeit: string | null | undefined): string {
  const a = t(arbeitszeit).toLowerCase()
  return a.includes("teilzeit") && !a.includes("vollzeit") ? "teilzeit" : "vollzeit"
}

export function workingModel(homeoffice: string | null | undefined): string {
  const h = t(homeoffice).toLowerCase()
  if (!h || /^(nein|kein|keins|nicht)/.test(h)) return "vor_ort"
  if (/100\s*%|vollständig remote|komplett remote|nur remote/.test(h)) return "remote"
  return "hybrid"
}

function section(title: string, body: string): string | null {
  return body ? `${title}\n\n${body}` : null
}

export function buildJobDescription(profile: Partial<Profile> | null, position: Partial<Position>): string {
  const benefits = (profile?.benefits ?? []).filter((b) => t(b))
  const offer = [
    ...benefits.map((b) => `✅ ${t(b)}`),
    t(profile?.arbeitszeiten) && `🕒 Arbeitszeiten: ${t(profile?.arbeitszeiten)}`,
    t(profile?.homeoffice) && `🏠 Homeoffice: ${t(profile?.homeoffice)}`,
    t(position.gehalt) && `💶 Gehalt: ${t(position.gehalt)}`,
  ].filter(Boolean)
  return [
    section("🏢 Über uns", t(profile?.intro)),
    section("📋 Ihre Aufgaben", t(position.aufgaben)),
    section("🎯 Ihr Profil", buildRequirements(position)),
    section("✨ Das bieten wir", offer.join("\n")),
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function buildRequirements(position: Partial<Position>): string {
  return [
    t(position.anforderungen),
    t(position.berufserfahrung) && `Berufserfahrung: ${t(position.berufserfahrung)}`,
    t(position.software) && `Software: ${t(position.software)}`,
  ]
    .filter(Boolean)
    .join("\n")
}

export function buildJobPayload(
  client: { name: string },
  profile: Partial<Profile> | null,
  position: Position,
  companyId: string
): Record<string, unknown> {
  const salary = parseSalary(position.gehalt)
  return {
    title: position.title,
    company: client.name,
    company_id: companyId,
    location: [position.plz, position.ort].filter(Boolean).join(" ") || null,
    city: position.ort,
    postal_code: position.plz,
    latitude: position.lat,
    longitude: position.lng,
    employment_type: employmentType(position.arbeitszeit),
    working_model: workingModel(profile?.homeoffice),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_range: t(position.gehalt) || null,
    description: buildJobDescription(profile, position),
    requirements: buildRequirements(position) || null,
    benefits: (profile?.benefits ?? []).filter((b) => t(b)),
    is_active: true,
    status: "published",
    updated_at: new Date().toISOString(),
  }
}

export interface ProfileSyncResult {
  firstPublish: boolean
  created: number
  updated: number
}

// Überträgt Firma und alle Stellen. initial=true ist das erste Veröffentlichen per Knopf.
export async function publishClientProfileToKanzleistelle(clientId: string, db: Db = kandidatenwerk()): Promise<ProfileSyncResult> {
  const ks = kanzleistelle()
  const [{ data: client, error: clientError }, { data: profile }, { data: positions }, { data: primary }] = await Promise.all([
    db.from("clients").select("id, name, logo_url, kanzleistelle_company_id, ort").eq("id", clientId).single(),
    db.from("client_profiles").select("*").eq("client_id", clientId).maybeSingle(),
    db.from("client_positions").select("*").eq("client_id", clientId).order("created_at"),
    db.from("client_locations").select("plz, ort").eq("client_id", clientId).eq("is_primary", true).maybeSingle(),
  ])
  if (clientError || !client) throw new Error(clientError?.message ?? "Kunde nicht gefunden")
  if (!profile?.finalized_at) throw new Error("Das Kanzleiprofil ist noch nicht abgeschlossen.")

  const company = {
    name: client.name,
    description: t(profile.intro) || null,
    location: primary?.ort ?? client.ort ?? null,
    website: t(profile.website) || null,
    logo_url: client.logo_url,
    is_active: true,
    kandidatenwerk_client_id: client.id,
  }
  const firstPublish = !client.kanzleistelle_company_id
  let companyId = client.kanzleistelle_company_id
  if (companyId) {
    const { error } = await ks.from("companies").update(company).eq("id", companyId)
    if (error) throw new Error(`Firma: ${error.message}`)
  } else {
    const { data, error } = await ks
      .from("companies")
      .insert({ ...company, user_id: null, admin_notes: "Automatisch aus dem Kandidatenwerk-Kanzleiprofil übernommen" })
      .select("id")
      .single()
    if (error) throw new Error(`Firma: ${error.message}`)
    companyId = data.id as string
    const { error: linkError } = await db.from("clients").update({ kanzleistelle_company_id: companyId }).eq("id", clientId)
    if (linkError) throw new Error(linkError.message)
  }

  const result: ProfileSyncResult = { firstPublish, created: 0, updated: 0 }
  for (const position of positions ?? []) {
    const payload = buildJobPayload(client, profile, position, companyId!)
    if (position.kanzleistelle_job_id) {
      const { error } = await ks.from("jobs").update(payload).eq("id", position.kanzleistelle_job_id)
      if (error) throw new Error(`Stelle „${position.title}“: ${error.message}`)
      result.updated++
    } else {
      const { data, error } = await ks.from("jobs").insert(payload).select("id").single()
      if (error) throw new Error(`Stelle „${position.title}“: ${error.message}`)
      const { error: linkError } = await db.from("client_positions").update({ kanzleistelle_job_id: data.id as string }).eq("id", position.id)
      if (linkError) throw new Error(linkError.message)
      result.created++
    }
  }
  await db.from("clients").update({ kanzleistelle_synced_at: new Date().toISOString(), kanzleistelle_sync_error: null }).eq("id", clientId)
  return result
}

// Automatische Aktualisierung nach Änderungen an Profil, Stellen, Standorten oder Logo -
// nur, wenn der Kunde schon per Knopf veröffentlicht wurde und das Profil abgeschlossen ist.
// Fehler brechen die eigentliche Änderung nicht ab, sondern stehen am Kunden.
export async function syncKanzleistelleIfPublished(clientId: string): Promise<void> {
  let db: Db | null = null
  try {
    db = kandidatenwerk()
    const [{ data: client }, { data: profile }] = await Promise.all([
      db.from("clients").select("kanzleistelle_company_id, kanzleistelle_synced_at").eq("id", clientId).single(),
      db.from("client_profiles").select("finalized_at").eq("client_id", clientId).maybeSingle(),
    ])
    // Nur Kunden, die über das Kanzleiprofil veröffentlicht wurden (synced_at gesetzt).
    if (!client?.kanzleistelle_company_id || !client.kanzleistelle_synced_at || !profile?.finalized_at) return
    await publishClientProfileToKanzleistelle(clientId, db)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error("Kanzleistelle24-Aktualisierung fehlgeschlagen:", clientId, message)
    await db?.from("clients").update({ kanzleistelle_sync_error: message }).eq("id", clientId)
  }
}

// Gelöschte Stelle: Anzeige auf Kanzleistelle24 deaktivieren.
export async function deactivateKanzleistelleJob(jobId: string): Promise<void> {
  try {
    const { error } = await kanzleistelle().from("jobs").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", jobId)
    if (error) throw new Error(error.message)
  } catch (err) {
    console.error("Kanzleistelle24-Anzeige konnte nicht deaktiviert werden:", jobId, err instanceof Error ? err.message : err)
  }
}
