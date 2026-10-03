// Übernahme gewonnener Kunden aus Close (Vertriebs-CRM) über Zapier (Paket 10).
// Zapier ruft /api/webhooks/close-won mit einem flachen JSON auf (Felder siehe
// CloseWebhookPayload). Der Kunde wird angelegt oder - per close_lead_id bzw.
// eindeutigem Namen - verknüpft; Kanzleiprofil, Kontakt und Stelle werden vorbefüllt.
// Bestehende, von Hand gepflegte Angaben werden nie überschrieben, nur Lücken gefüllt.
import type { SupabaseClient } from "@supabase/supabase-js"
import { geocodePlz } from "@/lib/geocode-plz"
import { PROFILE_FIELDS } from "@/lib/client-project"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"

export interface CloseWebhookPayload {
  close_lead_id?: string
  firma?: string
  website?: string
  telefon?: string
  email?: string
  strasse?: string
  plz?: string
  ort?: string
  ansprechpartner_name?: string
  ansprechpartner_email?: string
  ansprechpartner_telefon?: string
  ansprechpartner_position?: string
  vertragsstart?: string
  laufzeit_monate?: string | number
  key_account_manager_email?: string
  vertriebsnotizen?: string
  kurzbeschreibung?: string
  intro?: string
  mitarbeiterzahl?: string
  standorte?: string
  mandantenstruktur?: string
  software?: string
  arbeitszeiten?: string
  homeoffice?: string
  benefits?: string | string[]
  ansprechpartner_bewerbung?: string
  stelle_titel?: string
  stelle_berufsbild?: string
  stelle_plz?: string
  stelle_ort?: string
  stelle_umkreis_km?: string | number
  stelle_arbeitszeit?: string
  stelle_berufserfahrung?: string
  stelle_software?: string
  stelle_gehalt?: string
  stelle_start?: string
  stelle_aufgaben?: string
  stelle_anforderungen?: string
}

export interface CloseWebhookResult {
  clientId: string
  outcome: "angelegt" | "verknuepft" | "aktualisiert"
  filled: string[]
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).trim()
  return t === "" ? null : t
}

// "2026-10-01", "01.10.2026" oder "1.10.26" -> "2026-10-01"
export function parseGermanDate(v: unknown): string | null {
  const t = text(v)
  if (!t) return null
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const de = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/)
  if (!de) return null
  const year = de[3].length === 2 ? `20${de[3]}` : de[3]
  return `${year}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}`
}

// Firmennamen vergleichbar machen (Groß-/Kleinschreibung, Rechtsform, Satzzeichen).
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[&+]/g, " und ")
    .replace(/\b(gmbh|mbh|partg|partgmbb|mbb|kg|co|ag|ug|ohg|gbr|e\.?\s?k\.?|steuerberatungsgesellschaft|stbg)\b/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function splitBenefits(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.map((b) => b.trim()).filter(Boolean)
  return (text(v) ?? "")
    .split(/[\n;,•]+/)
    .map((b) => b.replace(/^[-*\s]+/, "").trim())
    .filter(Boolean)
}

export async function processCloseWebhook(db: SupabaseClient, payload: CloseWebhookPayload): Promise<CloseWebhookResult> {
  const closeLeadId = text(payload.close_lead_id)
  const firma = text(payload.firma)
  if (!closeLeadId) throw new Error("close_lead_id fehlt.")
  if (!firma) throw new Error("firma fehlt.")

  const filled: string[] = []
  let outcome: CloseWebhookResult["outcome"] = "aktualisiert"

  // 1. Kunde finden: Close-ID, sonst eindeutiger Name, sonst neu anlegen.
  let { data: client } = await db.from("clients").select("*").eq("close_lead_id", closeLeadId).maybeSingle()
  if (!client) {
    const { data: all } = await db.from("clients").select("*").is("close_lead_id", null)
    const wanted = normalizeCompanyName(firma)
    const matches = (all ?? []).filter((c) => normalizeCompanyName(c.name as string) === wanted)
    if (matches.length === 1) {
      client = matches[0]
      await db.from("clients").update({ close_lead_id: closeLeadId }).eq("id", client.id)
      outcome = "verknuepft"
    }
  }
  if (!client) {
    const { data: agency } = await db.from("agencies").select("id").limit(1).single()
    const { data: created, error } = await db
      .from("clients")
      .insert({ name: firma, close_lead_id: closeLeadId, status: "active", agency_id: agency?.id, project_phase: "onboarding" })
      .select("*")
      .single()
    if (error) throw new Error(error.message)
    client = created
    outcome = "angelegt"
  }
  const clientId = client!.id as string

  // 2. Kundendaten: nur leere Felder füllen.
  const updates: Record<string, unknown> = {}
  const fill = (column: string, value: unknown, label: string) => {
    if (value !== null && value !== undefined && (client![column] === null || client![column] === undefined || client![column] === "")) {
      updates[column] = value
      filled.push(label)
    }
  }
  fill("contact_email", text(payload.email), "E-Mail")
  fill("phone", text(payload.telefon), "Telefon")
  const plz = text(payload.plz)?.match(/\d{5}/)?.[0] ?? null
  if (plz && !client!.plz) {
    const coords = geocodePlz(plz)
    updates.plz = plz
    if (coords) Object.assign(updates, { lat: coords.lat, lng: coords.lng })
    filled.push("PLZ")
  }
  fill("ort", text(payload.ort), "Ort")
  fill("contract_start", parseGermanDate(payload.vertragsstart), "Vertragsstart")
  const term = Number(payload.laufzeit_monate)
  fill("contract_term_months", Number.isInteger(term) && term > 0 ? term : null, "Laufzeit")
  const kamEmail = text(payload.key_account_manager_email)?.toLowerCase()
  if (kamEmail && !client!.key_account_manager_id) {
    const { data: kam } = await db.from("profiles").select("id").ilike("email", kamEmail).neq("role", "client").maybeSingle()
    if (kam) {
      updates.key_account_manager_id = kam.id
      filled.push("Key Account Manager")
    }
  }
  if (Object.keys(updates).length > 0) {
    const { error } = await db.from("clients").update(updates).eq("id", clientId)
    if (error) throw new Error(error.message)
  }

  // 3. Kanzleiprofil vorbefüllen (nur Lücken).
  const { data: profile } = await db.from("client_profiles").select("*").eq("client_id", clientId).maybeSingle()
  const profileValues: Record<string, unknown> = {}
  const address = [text(payload.strasse), [plz, text(payload.ort)].filter(Boolean).join(" ")].filter(Boolean).join(", ")
  const incoming: Record<string, string | null> = {
    ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, text((payload as Record<string, unknown>)[f.key])])),
    standorte: text(payload.standorte) ?? (address || null),
  }
  for (const f of PROFILE_FIELDS) {
    if (incoming[f.key] && !text(profile?.[f.key])) {
      profileValues[f.key] = incoming[f.key]
      filled.push(f.label)
    }
  }
  const benefits = splitBenefits(payload.benefits)
  if (benefits.length > 0 && !((profile?.benefits as string[] | null) ?? []).length) {
    profileValues.benefits = benefits
    filled.push("Benefits")
  }
  if (Object.keys(profileValues).length > 0 || !profile) {
    const { error } = await db.from("client_profiles").upsert({ client_id: clientId, ...profileValues, updated_at: new Date().toISOString() }, { onConflict: "client_id" })
    if (error) throw new Error(error.message)
  }

  // 4. Ansprechpartner als Kontakt (falls E-Mail noch nicht vorhanden).
  const contactName = text(payload.ansprechpartner_name)
  const contactEmail = text(payload.ansprechpartner_email)?.toLowerCase() ?? null
  if (contactName) {
    const { data: contacts } = await db.from("client_contacts").select("email, name").eq("client_id", clientId)
    const exists = (contacts ?? []).some((c) => (contactEmail && (c.email as string | null)?.toLowerCase() === contactEmail) || c.name === contactName)
    if (!exists) {
      await db.from("client_contacts").insert({
        client_id: clientId,
        name: contactName,
        email: contactEmail,
        phone: text(payload.ansprechpartner_telefon),
        role: text(payload.ansprechpartner_position),
      })
      filled.push("Ansprechpartner")
    }
  }

  // 5. Gesuchte Stelle (falls mit diesem Titel noch nicht vorhanden).
  const positionTitle = text(payload.stelle_titel)
  if (positionTitle) {
    const { data: positions } = await db.from("client_positions").select("title").eq("client_id", clientId)
    if (!(positions ?? []).some((p) => (p.title as string).toLowerCase() === positionTitle.toLowerCase())) {
      const positionPlz = text(payload.stelle_plz)?.match(/\d{5}/)?.[0] ?? plz
      const coords = positionPlz ? geocodePlz(positionPlz) : null
      const radius = Number(payload.stelle_umkreis_km)
      await db.from("client_positions").insert({
        client_id: clientId,
        title: positionTitle,
        berufsbild: mapKanzleistelleBerufsbild(text(payload.stelle_berufsbild) ?? positionTitle),
        plz: positionPlz,
        ort: text(payload.stelle_ort) ?? text(payload.ort),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radius_km: Number.isFinite(radius) && radius > 0 ? Math.round(radius) : 25,
        arbeitszeit: text(payload.stelle_arbeitszeit),
        berufserfahrung: text(payload.stelle_berufserfahrung),
        software: text(payload.stelle_software),
        gehalt: text(payload.stelle_gehalt),
        startdatum: text(payload.stelle_start),
        aufgaben: text(payload.stelle_aufgaben),
        anforderungen: text(payload.stelle_anforderungen),
      })
      filled.push(`Stelle „${positionTitle}“`)
    }
  }

  // 6. Verlauf im Projekt-Reiter.
  const intro =
    outcome === "angelegt"
      ? "Kunde aus Close übernommen (gewonnen)."
      : outcome === "verknuepft"
        ? `Bestehender Kunde mit Close verknüpft (Lead ${closeLeadId}).`
        : "Daten aus Close erneut übertragen."
  await db.from("client_comments").insert({
    client_id: clientId,
    author_id: null,
    kind: "system",
    content: `${intro}${filled.length > 0 ? ` Übernommen: ${filled.join(", ")}.` : " Keine neuen Angaben."}`,
  })

  return { clientId, outcome, filled }
}
