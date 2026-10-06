"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext, requireStaffUser } from "@/lib/auth-guards"
import { ensureCampaignAssignment } from "@/lib/client-assignment"
import {
  rankAvailableCandidates,
  type AvailableCandidate,
  type AvailableSort,
  type CandidateRow,
} from "@/lib/available-candidates"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { geocodePlz } from "@/lib/geocode-plz"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { matchCampaignToCandidates } from "@/lib/matching"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { fetchMetaPages, fetchMetaLeadForms, createMetaTestLead, buildFormToPageAccessTokenMap, type MetaPage, type MetaLeadForm } from "@/lib/meta-ads-client"
import { ensureClientAssignment } from "@/lib/client-assignment"
import type { TablesUpdate } from "@/types/database"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { after } from "next/server"
import { notifyClientAboutAssignment } from "@/lib/assignment-notify"


// requireStaffUser() aus src/lib/auth-guards.ts (Security-Review 08./09.09.2026) -
// schützt u.a. die Meta-Actions unten: die listen Facebook-Seiten-/Formularnamen aller
// Mandanten und dürfen nie von einem Portal-Kunden aufgerufen werden.

export async function getCampaignCandidatesForExport(campaignId: string): Promise<
  { error: string } | { candidates: Array<{ first_name: string; last_name: string; email: string | null; phone: string | null; status: string; custom_fields: Record<string, string> | null }> }
> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  // Gleiche Auswahl wie der Reiter "Kandidaten": bei Kanzlei-Kampagnen die
  // zugeordneten Kandidaten (Atlas T-40), sonst die Herkunft (candidates.campaign_id).
  const { data: campaign } = await supabase.from("campaigns").select("kind").eq("id", campaignId).maybeSingle()
  if (!campaign) return { error: "Kampagne nicht gefunden." }

  type ExportRow = { first_name: string; last_name: string; email: string | null; phone: string | null; status: string; custom_fields: unknown }
  let data: ExportRow[] = []
  if (campaign.kind === "kanzlei") {
    const { data: rows, error } = await supabase
      .from("client_assignments")
      .select("candidates(first_name, last_name, email, phone, status, custom_fields)")
      .eq("campaign_id", campaignId)
      .is("removed_at", null)
      .order("created_at", { ascending: true })
    if (error) return { error: error.message }
    data = (rows ?? [])
      .map((r) => (Array.isArray(r.candidates) ? r.candidates[0] : r.candidates) as ExportRow | null)
      .filter((c): c is ExportRow => c !== null)
  } else {
    const { data: rows, error } = await supabase
      .from("candidates")
      .select("first_name, last_name, email, phone, status, custom_fields")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true })
    if (error) return { error: error.message }
    data = rows ?? []
  }
  return {
    candidates: data.map((c) => ({
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      status: c.status,
      custom_fields: c.custom_fields && typeof c.custom_fields === "object" && !Array.isArray(c.custom_fields)
        ? (c.custom_fields as Record<string, string>)
        : null,
    })),
  }
}

export async function deleteCampaignWithCandidatesAction(campaignId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { error: candidateErr } = await supabase.from("candidates").delete().eq("campaign_id", campaignId)
  if (candidateErr) return { error: candidateErr.message }
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/campaigns")
  redirect("/dashboard/campaigns")
}

export async function archiveCampaignAction(campaignId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { error } = await supabase
    .from("campaigns")
    .update({ status: "Archiviert" })
    .eq("id", campaignId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/campaigns")
  redirect("/dashboard/campaigns")
}

export async function deleteCampaignAction(campaignId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  // ON DELETE SET NULL handles candidates automatically
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/campaigns")
  redirect("/dashboard/campaigns")
}

export async function updateCampaignTitleAction(
  campaignId: string,
  title: string
): Promise<{ error: string } | null> {
  const trimmed = title.trim()
  if (!trimmed) return { error: "Titel darf nicht leer sein." }

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { error } = await supabase
    .from("campaigns")
    .update({ title: trimmed })
    .eq("id", campaignId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath("/dashboard/campaigns")
  return null
}

export async function updateCampaignSettingsAction(
  campaignId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const meta_form_id = formData.get("meta_form_id") as string
  const meta_form_name = formData.get("meta_form_name") as string
  const meta_field_mapping_json = formData.get("meta_field_mapping_json") as string

  let meta_field_mapping: string[] = []
  try {
    const parsed = JSON.parse(meta_field_mapping_json || "[]")
    meta_field_mapping = Array.isArray(parsed) ? parsed : []
  } catch {
    meta_field_mapping = []
  }

  const { data: before } = await supabase
    .from("campaigns")
    .select("berufsbild, plz, radius_km, title")
    .eq("id", campaignId)
    .single()

  // Meta-Formular nur bei Lead-Kampagnen (Kanzlei-Kampagnen schicken stattdessen die
  // Feld-Vorlage, Paket 8).
  const update: TablesUpdate<"campaigns"> = formData.has("meta_form_id")
    ? { meta_form_id: meta_form_id || null, meta_form_name: meta_form_name || null, meta_field_mapping }
    : {}
  if (formData.has("field_template_id")) {
    update.field_template_id = (formData.get("field_template_id") as string) || null
  }

  let matchingRelevantChanged = false

  if (formData.has("berufsbild")) {
    const berufsbildInput = (formData.get("berufsbild") as string) || null
    // Automatischer Vorschlag NUR, wenn im Formular nichts gewählt wurde UND aktuell
    // noch gar kein Wert gesetzt ist - ein bereits vorhandener Wert (auch manuell
    // gesetzt) wird dadurch nie überschrieben; das bewusste Leeren eines gesetzten
    // Werts über das Dropdown bleibt davon unberührt möglich.
    update.berufsbild =
      berufsbildInput ??
      (!before?.berufsbild && before?.title ? mapKanzleistelleBerufsbild(before.title) : null)
    if (update.berufsbild !== (before?.berufsbild ?? null)) matchingRelevantChanged = true
  }
  if (formData.has("plz")) {
    const plz = (formData.get("plz") as string) || ""
    const coords = plz ? geocodePlz(plz) : null
    update.plz = plz || null
    update.lat = coords?.lat ?? null
    update.lng = coords?.lng ?? null
    update.location_id = await getOrCreateLocationForPlz(supabase, plz)
    if (update.plz !== (before?.plz ?? null)) matchingRelevantChanged = true
  }
  if (formData.has("radius_km")) {
    const radiusRaw = formData.get("radius_km") as string
    update.radius_km = radiusRaw ? parseInt(radiusRaw, 10) : 25
    if (update.radius_km !== (before?.radius_km ?? 25)) matchingRelevantChanged = true
  }

  const { error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", campaignId)

  if (error) return { error: error.message }

  if (matchingRelevantChanged) {
    try {
      await matchCampaignToCandidates(supabase, campaignId)
    } catch (matchError) {
      console.error("Matching fehlgeschlagen für Kampagne", campaignId, matchError)
    }
  }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}


export async function listMetaPagesAction(): Promise<
  { success: true; pages: MetaPage[] } | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return { success: false, error: staffError.error }

  try {
    const pages = await fetchMetaPages()
    // access_token NIE an den Browser durchreichen (siehe Kommentar in meta-ads-client.ts) -
    // wird serverseitig in listMetaLeadFormsAction erneut per fetchMetaPages() nachgeschlagen.
    return { success: true, pages: pages.map(({ id, name }) => ({ id, name })) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function listMetaLeadFormsAction(
  pageId: string
): Promise<{ success: true; forms: MetaLeadForm[] } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return { success: false, error: staffError.error }

  try {
    // leadgen_forms verlangt den Page-Access-Token DIESER Seite statt des System-User-
    // Tokens (siehe metaGraphFetch-Kommentar) - daher hier erst die Seite nachschlagen.
    const pages = await fetchMetaPages()
    const page = pages.find((p) => p.id === pageId)
    if (!page?.access_token) {
      return { success: false, error: "Kein Zugriffstoken für diese Seite gefunden." }
    }
    const forms = await fetchMetaLeadForms(pageId, page.access_token)
    return { success: true, forms }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Fordert einen Test-Lead bei Meta an (siehe createMetaTestLead-Kommentar). Braucht nur
// die Formular-ID - die passende Seite (und deren Access-Token) wird selbst über
// buildFormToPageAccessTokenMap() nachgeschlagen (iteriert einmal alle Seiten/Formulare,
// wie scripts/meta-leads-sync.ts es auch tut), statt eine zuvor im Browser-State
// ausgewählte Seiten-ID vorauszusetzen (bis 14.09.2026 der Fall - Button war dadurch nach
// jedem Neuladen/Speichern erst wieder nutzbar, nachdem man das Formular über "Formular
// ändern" neu ausgewählt hatte, unnötig umständlich für ein bereits hinterlegtes
// Formular).
export async function requestMetaTestLeadAction(
  formId: string
): Promise<{ success: true; leadId: string } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return { success: false, error: staffError.error }

  try {
    const tokenMap = await buildFormToPageAccessTokenMap()
    const pageAccessToken = tokenMap.get(formId)
    if (!pageAccessToken) {
      return { success: false, error: "Kein Zugriffstoken für das Formular dieser Seite gefunden." }
    }
    const result = await createMetaTestLead(formId, pageAccessToken)
    return { success: true, leadId: result.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// Dupliziert eine Kampagne, optional zu einem anderen Kunden ("Kopieren zu anderem
// Kunden" ist serverseitig exakt dieselbe Action wie ein "echtes" Duplikat, nur mit
// targetClientId = aktueller Kunde). Externe Verknüpfungen (Meta-Formular,
// Kanzleistelle24-Job, Leadtable-Kampagne) werden NIE mitkopiert - diese IDs müssen pro
// echter externer Kampagne eindeutig sein, sonst würden zwei Kandidatenwerk-Kampagnen
// denselben Meta-Webhook/Job verarbeiten.
export async function duplicateCampaignAction(
  campaignId: string,
  targetClientId: string,
  includeLeads: boolean
): Promise<{ error: string } | { newCampaignId: string }> {
  const supabase = await createSupabaseServerClient()
  const guardError = await requireStaffUser(supabase)
  if (guardError) return guardError
  // Nur für den campaign_automation_runs-Dedup-Insert unten nötig (RLS dort bewusst
  // ohne Policies, siehe Kommentar am Insert weiter unten) - alles andere in dieser
  // Funktion läuft weiterhin über den normalen, RLS-gebundenen supabase-Client.
  const admin = createSupabaseAdminClient()

  const { data: original, error: fetchError } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single()
  if (fetchError || !original) return { error: fetchError?.message ?? "Kampagne nicht gefunden." }

  const { data: newCampaign, error: insertError } = await supabase
    .from("campaigns")
    .insert({
      client_id: targetClientId,
      title: `${original.title} (Kopie)`,
      description: original.description,
      status: original.status,
      berufsbild: original.berufsbild,
      plz: original.plz,
      lat: original.lat,
      lng: original.lng,
      radius_km: original.radius_km,
      location_id: original.location_id,
      meta_campaign_id: null,
      meta_form_id: null,
      meta_field_mapping: null,
      meta_form_name: null,
      meta_webhook_last_test_at: null,
      kanzleistelle_job_id: null,
      leadtable_campaign_id: null,
    })
    .select("id")
    .single()
  if (insertError || !newCampaign) return { error: insertError?.message ?? "Kampagne konnte nicht angelegt werden." }

  // Automatisierungen immer mitkopieren (Kampagnen-Einstellung, unabhängig von Leads) -
  // Dedup-Historie (campaign_automation_runs) bewusst NICHT mitkopiert, die neue Kampagne
  // startet dafür frisch.
  const { data: automations } = await supabase
    .from("campaign_automations")
    .select("*")
    .eq("campaign_id", campaignId)

  const newAutomationIds: string[] = []
  if (automations && automations.length > 0) {
    for (const a of automations) {
      const { data: newAutomation, error: autoError } = await supabase
        .from("campaign_automations")
        .insert({
          campaign_id: newCampaign.id,
          name: a.name,
          trigger: a.trigger,
          trigger_status: a.trigger_status,
          delay_seconds: a.delay_seconds,
          active: a.active,
          recipient: a.recipient,
          subject: a.subject,
          body_html: a.body_html,
        })
        .select("id")
        .single()
      if (autoError) return { error: autoError.message }
      if (newAutomation) newAutomationIds.push(newAutomation.id)
    }
  }

  if (includeLeads) {
    const { data: candidates } = await supabase
      .from("candidates")
      .select("*")
      .eq("campaign_id", campaignId)

    for (const c of candidates ?? []) {
      const { data: newCandidate, error: candError } = await supabase
        .from("candidates")
        .insert({
          campaign_id: newCampaign.id,
          client_id: targetClientId,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          phone: c.phone,
          status: c.status,
          source: c.source,
          notes: c.notes,
          custom_fields: c.custom_fields,
          description: c.description,
          berufsbild: c.berufsbild,
          plz: c.plz,
          lat: c.lat,
          lng: c.lng,
          // meta_lead_id / leadtable-spezifische IDs bewusst NICHT mitkopiert - siehe
          // gleiche Begründung wie bei den externen Kampagnen-Verknüpfungen oben.
        })
        .select("id")
        .single()
      if (candError) return { error: candError.message }
      if (!newCandidate) continue

      try {
        await ensureClientAssignment(supabase, newCandidate.id, targetClientId)
      } catch (assignError) {
        console.error("Kunden-Zuordnung fehlgeschlagen für kopierten Kandidaten", newCandidate.id, assignError)
      }

      // Verhindert Doppel-Mails durch kopierte "Neuer Lead"-Automatisierungen: die Kopien
      // bekommen ein frisches created_at, ohne diesen Dedup-Eintrag würde eine aktive
      // "Neuer Lead"-Automatisierung beim nächsten Cron-Lauf sofort für alle kopierten
      // (historischen) Kandidaten feuern, obwohl sie die Mail schon vom Original bekommen
      // haben - für künftige NEUE Leads auf der neuen Kampagne bleibt sie ganz normal aktiv.
      // campaign_automation_runs hat bewusst RLS ohne Policies (siehe Migration
      // 20260922000001) - ein Insert über den normalen, an die Staff-Session gebundenen
      // supabase-Client wird von RLS lautlos verworfen (0 statt der erwarteten Zeilen,
      // Fehler wurde hier bisher auch gar nicht geprüft). Deshalb wie in
      // inviteClientPortalUserAction/scripts/run-automations.ts über den
      // Service-Role-Client schreiben.
      for (const newAutomationId of newAutomationIds) {
        const { error: dedupError } = await admin.from("campaign_automation_runs").insert({
          automation_id: newAutomationId,
          candidate_id: newCandidate.id,
        })
        if (dedupError) {
          console.error(
            "Dedup-Vorab-Eintrag fehlgeschlagen für kopierten Kandidaten",
            newCandidate.id,
            "Automatisierung",
            newAutomationId,
            dedupError
          )
        }
      }
    }
  }

  revalidatePath("/dashboard/campaigns")
  return { newCampaignId: newCampaign.id }
}

// Verschiebt eine bestehende Kampagne zu einem anderen Kunden (Kampagne bleibt
// dieselbe, bekommt nur eine neue client_id) - im Unterschied zu
// duplicateCampaignAction, die eine neue Kampagne anlegt.
export async function moveCampaignToClientAction(
  campaignId: string,
  targetClientId: string,
  takeLeadsAlong: boolean
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guardError = await requireStaffUser(supabase)
  if (guardError) return guardError

  const { error: updateError } = await supabase
    .from("campaigns")
    .update({ client_id: targetClientId })
    .eq("id", campaignId)
  if (updateError) return { error: updateError.message }

  if (takeLeadsAlong) {
    const { data: candidates } = await supabase
      .from("candidates")
      .select("id, client_id")
      .eq("campaign_id", campaignId)

    for (const c of candidates ?? []) {
      const { error: candUpdateError } = await supabase
        .from("candidates")
        .update({ client_id: targetClientId })
        .eq("id", c.id)
      if (candUpdateError) return { error: candUpdateError.message }

      // Alte aktive Zuordnung(en) zum bisherigen Kunden beenden (Soft-Delete, gleiches
      // Prinzip wie removeClientAssignmentAction), neue zum Zielkunden sicherstellen -
      // andere Zuordnungen des Kandidaten zu WEITEREN Kunden (aus anderen Kampagnen)
      // bleiben unangetastet.
      if (c.client_id) {
        await supabase
          .from("client_assignments")
          .update({ removed_at: new Date().toISOString() })
          .eq("candidate_id", c.id)
          .eq("client_id", c.client_id)
          .is("removed_at", null)
      }
      try {
        await ensureClientAssignment(supabase, c.id, targetClientId)
      } catch (assignError) {
        console.error("Kunden-Zuordnung fehlgeschlagen beim Verschieben, Kandidat", c.id, assignError)
      }
    }
  }
  // Bei "nicht mitnehmen": campaigns.client_id ändert sich, candidates.client_id und
  // ihre client_assignments bleiben bewusst unverändert beim bisherigen Kunden - die
  // historischen Leads "gehören" weiter dorthin, nur die Kampagne selbst wandert.

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath("/dashboard/campaigns")
  return null
}

// ============================================================
// "Passende Kandidaten" einer Kanzlei-Kampagne (Atlas T-40, Zielbild T-31): Kandidaten
// mit gleichem Berufsbild im Umkreis der Kampagne, die ihr noch nicht zugeordnet sind -
// mit Ein-Klick-Zuordnung. Zugeordnet wird nur hier, nicht mehr im Kundenprofil.
// Filter laufen in der DB, Entfernung/Umkreis/Sortierung in rankAvailableCandidates().
// Obergrenze MAX_CANDIDATE_ROWS hält die Abfrage klein; bei deutlich mehr Kandidaten
// müsste die Umkreissuche in die DB wandern.
const AVAILABLE_PAGE_SIZE = 20
const MAX_CANDIDATE_ROWS = 3000

async function loadKanzleiCampaign(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, campaignId: string) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, title, berufsbild, lat, lng, radius_km, kind, client_id")
    .eq("id", campaignId)
    .eq("kind", "kanzlei")
    .maybeSingle()
  return data
}

export async function searchAvailableCandidatesAction(
  campaignId: string,
  filters: {
    q: string
    status: string
    radius: "kampagne" | "alle" | number // Umkreis der Kampagne, ohne Grenze oder km
    sort: AvailableSort
    page: number
  }
): Promise<
  | { error: string }
  | {
      items: AvailableCandidate[]
      total: number
      totalPages: number
      page: number
      truncated: boolean
      campaignHasLocation: boolean
      effectiveRadiusKm: number | null
    }
> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const campaign = await loadKanzleiCampaign(supabase, campaignId)
  if (!campaign) return { error: "Kampagne nicht gefunden." }
  if (!campaign.berufsbild) return { error: "Für diese Kampagne ist kein Berufsbild hinterlegt." }

  let query = supabase
    .from("candidates")
    .select("id, first_name, last_name, email, plz, lat, lng, berufsbild, status, source, created_at")
    // Kanzleien bekommen nur vorqualifizierte Kandidaten (Paket 19, T-86).
    .eq("status", ASSIGNABLE_STATUS)
    .eq("is_demo", false)
    .eq("berufsbild", campaign.berufsbild)
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATE_ROWS)

  // Zeichen entfernen, die in der PostgREST-or()-Syntax eine Bedeutung haben.
  const q = filters.q.replace(/[%,()"\\*]/g, " ").trim()
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,plz.ilike.${q}%`)

  const [{ data: rows, error }, { data: assigned }] = await Promise.all([
    query,
    supabase.from("client_assignments").select("candidate_id").eq("campaign_id", campaign.id).is("removed_at", null),
  ])
  if (error) return { error: error.message }

  const effectiveRadiusKm =
    filters.radius === "kampagne" ? campaign.radius_km : filters.radius === "alle" ? null : filters.radius
  const ranked = rankAvailableCandidates((rows ?? []) as CandidateRow[], new Set((assigned ?? []).map((a) => a.candidate_id)), {
    clientLat: campaign.lat,
    clientLng: campaign.lng,
    radiusKm: effectiveRadiusKm,
    sort: filters.sort,
    page: filters.page,
    pageSize: AVAILABLE_PAGE_SIZE,
  })

  return {
    ...ranked,
    truncated: (rows ?? []).length >= MAX_CANDIDATE_ROWS,
    campaignHasLocation: campaign.lat !== null && campaign.lng !== null,
    effectiveRadiusKm,
  }
}

// Ein-Klick-Zuordnung aus "Passende Kandidaten" - idempotent über
// ensureCampaignAssignment, mit Verlaufseintrag.
export async function assignCandidateToCampaignAction(
  campaignId: string,
  candidateId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const campaign = await loadKanzleiCampaign(supabase, campaignId)
  if (!campaign) return { error: "Kampagne nicht gefunden." }

  try {
    const assignment = await ensureCampaignAssignment(supabase, candidateId, campaignId, guard.staff.userId)
    // Neue Zuordnung: Kanzlei per Mail informieren (Paket 20, T-90), nach der Antwort.
    if (assignment.created) after(() => notifyClientAboutAssignment(assignment.id, guard.staff.userId))
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Zugeordnet zu Kampagne „${campaign.title}“`,
    created_by: guard.staff.userId,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath(`/dashboard/candidates/${candidateId}`)
  if (campaign.client_id) revalidatePath(`/dashboard/clients/${campaign.client_id}`)
  return null
}
