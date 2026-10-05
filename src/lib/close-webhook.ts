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
  // Status, der den Zap ausgelöst hat: "Folgebesprechung zum SC vereinbart" oder "Gewonnen".
  close_status?: string
  // Link zum Lead in Close (optional, sonst aus der Lead-ID gebaut).
  close_url?: string
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
  // Aus den Gesprächstranskripten (Zapier-AI), nur intern:
  painpoints?: string
  ziele_zusammenarbeit?: string
  // Mehrere Stellen als JSON-Liste: [{"titel": "...", "berufsbild": "...", "plz": "...", ...}]
  stellen_json?: string | PositionPayload[]
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

export interface PositionPayload {
  titel?: string
  berufsbild?: string
  plz?: string
  ort?: string
  umkreis_km?: string | number
  arbeitszeit?: string
  berufserfahrung?: string
  software?: string
  gehalt?: string
  start?: string
  aufgaben?: string
  anforderungen?: string
}

// Stellen aus stellen_json (Liste) und den Einzelfeldern stelle_* zusammenführen.
export function collectPositions(payload: CloseWebhookPayload): PositionPayload[] {
  let list: PositionPayload[] = []
  const raw = payload.stellen_json
  if (Array.isArray(raw)) list = raw
  else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw.trim().replace(/^```(json)?|```$/g, ""))
      list = Array.isArray(parsed) ? parsed : []
    } catch {
      list = []
    }
  }
  if (text(payload.stelle_titel)) {
    list.push({
      titel: payload.stelle_titel,
      berufsbild: payload.stelle_berufsbild,
      plz: payload.stelle_plz,
      ort: payload.stelle_ort,
      umkreis_km: payload.stelle_umkreis_km,
      arbeitszeit: payload.stelle_arbeitszeit,
      berufserfahrung: payload.stelle_berufserfahrung,
      software: payload.stelle_software,
      gehalt: payload.stelle_gehalt,
      start: payload.stelle_start,
      aufgaben: payload.stelle_aufgaben,
      anforderungen: payload.stelle_anforderungen,
    })
  }
  return list.filter((p) => p && typeof p === "object" && text(p.titel))
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

// Lesbarer Close-Status (Zapier liefert den Status-Text aus Close).
export function closeStatusLabel(status: string): string {
  const s = status.toLowerCase()
  if (/gewonnen|won/.test(s)) return "Gewonnen"
  if (/folge/.test(s)) return "Folgebesprechung zum SC vereinbart"
  return status.trim()
}

export function closeLeadUrl(closeLeadId: string): string {
  return `https://app.close.com/lead/${encodeURIComponent(closeLeadId)}/`
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
    if (error?.code === "23505") {
      // Zwei Status-Wechsel kurz hintereinander (Folgebesprechung, dann Gewonnen): der
      // erste Aufruf hat den Kunden gerade angelegt - keinen zweiten anlegen.
      const { data: existing } = await db.from("clients").select("*").eq("close_lead_id", closeLeadId).single()
      client = existing
    } else if (error) {
      throw new Error(error.message)
    } else {
      client = created
      outcome = "angelegt"
    }
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
  // Close-Status und -Link: Status immer aktualisieren (kommt nur aus Close).
  const status = text(payload.close_status)
  const statusLabel = status ? closeStatusLabel(status) : null
  const previousStatus = (client!.close_status as string | null) ?? null
  if (statusLabel && statusLabel !== previousStatus) {
    updates.close_status = statusLabel
    updates.close_status_at = new Date().toISOString()
  }
  fill("close_url", text(payload.close_url) ?? closeLeadUrl(closeLeadId), "Close-Link")
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

  // 5. Gesuchte Stellen (nur solche, deren Titel es beim Kunden noch nicht gibt).
  const incomingPositions = collectPositions(payload)
  if (incomingPositions.length > 0) {
    const { data: positions } = await db.from("client_positions").select("title").eq("client_id", clientId)
    const known = new Set((positions ?? []).map((p) => (p.title as string).toLowerCase()))
    for (const p of incomingPositions) {
      const positionTitle = text(p.titel)!
      if (known.has(positionTitle.toLowerCase())) continue
      known.add(positionTitle.toLowerCase())
      const positionPlz = text(p.plz)?.match(/\d{5}/)?.[0] ?? plz
      const coords = positionPlz ? geocodePlz(positionPlz) : null
      const radius = Number(p.umkreis_km)
      await db.from("client_positions").insert({
        client_id: clientId,
        title: positionTitle,
        berufsbild: mapKanzleistelleBerufsbild(text(p.berufsbild) ?? positionTitle),
        plz: positionPlz,
        ort: text(p.ort) ?? text(payload.ort),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        radius_km: Number.isFinite(radius) && radius > 0 ? Math.round(radius) : 25,
        arbeitszeit: text(p.arbeitszeit),
        berufserfahrung: text(p.berufserfahrung),
        software: text(p.software),
        gehalt: text(p.gehalt),
        startdatum: text(p.start),
        aufgaben: text(p.aufgaben),
        anforderungen: text(p.anforderungen),
      })
      filled.push(`Stelle „${positionTitle}“`)
    }
  }

  // 6. Verlauf im Projekt-Reiter.
  const statusText = statusLabel ? ` Status in Close: ${statusLabel}.` : ""
  const intro =
    outcome === "angelegt"
      ? `Kunde aus Close übernommen.${statusText}`
      : outcome === "verknuepft"
        ? `Bestehender Kunde mit Close verknüpft (Lead ${closeLeadId}).${statusText}`
        : statusLabel && statusLabel !== previousStatus
          ? `Status in Close geändert: ${previousStatus ?? "–"} → ${statusLabel}. Kunde war bereits angelegt.`
          : "Daten aus Close erneut übertragen."
  await db.from("client_comments").insert({
    client_id: clientId,
    author_id: null,
    kind: "system",
    content: `${intro}${filled.length > 0 ? ` Übernommen: ${filled.join(", ")}.` : " Keine neuen Angaben."}`,
  })

  return { clientId, outcome, filled }
}
