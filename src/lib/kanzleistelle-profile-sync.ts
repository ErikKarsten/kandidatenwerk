// Kunde und gesuchte Stellen aus dem Kanzleiprofil zu Kanzleistelle24 (Paket 16, T-52).
//
// Die Firma bekommt das "Intro zur Kanzlei" als Beschreibung, jede gesuchte Stelle wird
// eine Stellenanzeige: Beschreibung = Über uns (Intro) + Ihre Aufgaben; Anforderungen und
// Benefits (inkl. Arbeitszeiten/Homeoffice) in den eigenen Feldern von Kanzleistelle24.
// Gehalt wird nie übertragen (Entscheidung 06.10.2026). Erstes Veröffentlichen per Knopf
// (nur bei abgeschlossenem Profil), danach überträgt syncKanzleistelleIfPublished Änderungen automatisch. Die alte,
// kampagnenbasierte Veröffentlichung (sync-kanzleistelle-jobs.ts) bleibt für Bestände.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { benefitSourceHash, prepareBenefits, type PreparedBenefits } from "@/lib/kanzleistelle-benefits"

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

// Aufgaben als Aufzählung, wenn sie zeilenweise gepflegt sind.
function asBullets(text: string): string {
  const lines = text.split(/\n+/).map((l) => l.replace(/^[-•*✅]\s*/, "").trim()).filter(Boolean)
  return lines.length > 1 ? lines.map((l) => `• ${l}`).join("\n") : text
}

export function buildJobDescription(profile: Partial<Profile> | null, position: Partial<Position>): string {
  return [section("🏢 Über uns", t(profile?.intro)), section("📋 Ihre Aufgaben", asBullets(t(position.aufgaben)))]
    .filter(Boolean)
    .join("\n\n")
}

// "Das bieten wir" steht als Benefits-Liste bei Kanzleistelle24 (nicht im Text).
export function buildBenefits(profile: Partial<Profile> | null): string[] {
  return [
    ...(profile?.benefits ?? []).map((b) => t(b)).filter(Boolean),
    t(profile?.arbeitszeiten) && `Arbeitszeiten: ${t(profile?.arbeitszeiten)}`,
    t(profile?.homeoffice) && `Homeoffice: ${t(profile?.homeoffice)}`,
  ].filter((b): b is string => !!b)
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
  companyId: string,
  // Per KI aufbereitete Benefits (kanzleistelle-benefits.ts); ohne gelten die Rohangaben.
  prepared: PreparedBenefits | null = null
): Record<string, unknown> {
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
    working_model: prepared?.workingModel ?? workingModel(profile?.homeoffice),
    // Gehalt nie übertragen - explizit leeren, falls es früher schon drin war.
    salary_min: null,
    salary_max: null,
    salary_range: null,
    description: buildJobDescription(profile, position),
    requirements: buildRequirements(position) || null,
    benefits: prepared?.benefits ?? buildBenefits(profile),
    is_active: true,
    status: "published",
    updated_at: new Date().toISOString(),
  }
}

// Aufbereitete Benefits vom Profil lesen bzw. bei geänderten Angaben neu erzeugen und
// speichern. KI-Fehler verhindern das Veröffentlichen nicht (dann Rohangaben).
async function resolvePreparedBenefits(db: Db, profile: Profile): Promise<PreparedBenefits | null> {
  const stored = profile as Profile & { kanzleistelle_benefits?: string[] | null; kanzleistelle_working_model?: string | null; kanzleistelle_benefits_hash?: string | null }
  const hash = benefitSourceHash(profile)
  if (stored.kanzleistelle_benefits_hash === hash && stored.kanzleistelle_benefits?.length) {
    return { benefits: stored.kanzleistelle_benefits, workingModel: (stored.kanzleistelle_working_model as PreparedBenefits["workingModel"]) ?? null }
  }
  try {
    const prepared = await prepareBenefits(profile)
    if (!prepared) return null
    const { error } = await (db as unknown as SupabaseClient)
      .from("client_profiles")
      .update({ kanzleistelle_benefits: prepared.benefits, kanzleistelle_working_model: prepared.workingModel, kanzleistelle_benefits_hash: hash })
      .eq("client_id", profile.client_id)
    if (error) console.error("Aufbereitete Benefits nicht gespeichert:", error.message)
    return prepared
  } catch (err) {
    console.error("Benefits-Aufbereitung fehlgeschlagen:", err instanceof Error ? err.message : err)
    return null
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

  const prepared = await resolvePreparedBenefits(db, profile)
  const result: ProfileSyncResult = { firstPublish, created: 0, updated: 0 }
  for (const position of positions ?? []) {
    const payload = buildJobPayload(client, profile, position, companyId!, prepared)
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
