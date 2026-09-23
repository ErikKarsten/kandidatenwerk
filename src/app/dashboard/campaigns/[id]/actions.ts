"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { geocodePlz } from "@/lib/geocode-plz"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { matchCampaignToCandidates, matchCandidateToCampaigns } from "@/lib/matching"
import { fetchAllCampaigns } from "@/lib/leadtable-import-customers"
import { importLeadtableCampaign } from "@/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { publishCampaignToKanzleistelle } from "@/lib/sync-kanzleistelle-jobs"
import { fetchMetaPages, fetchMetaLeadForms, createMetaTestLead, buildFormToPageAccessTokenMap, type MetaPage, type MetaLeadForm } from "@/lib/meta-ads-client"
import { ensureClientAssignment } from "@/lib/client-assignment"
import type { TablesUpdate } from "@/types/database"

// Siehe src/app/dashboard/candidates/page.tsx / clients-list.tsx / campaigns-list.tsx -
// derselbe Wert wird dort für "isArchived"-Prüfungen genutzt.
const ARCHIVED_STATUS = "Archiviert"

// Analog zu requireStaffUser() in clients/[id]/actions.ts und
// campaigns/[id]/automations-actions.ts (Security-Review 08./09.09.2026) - listet
// Facebook-Seiten-/Formularnamen aller Mandanten, darf nie von einem Portal-Kunden
// aufgerufen werden.
async function requireStaffUser(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ error: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role === "client") return { error: "Nicht berechtigt." }

  return null
}

export async function getCampaignCandidatesForExport(campaignId: string): Promise<
  { error: string } | { candidates: Array<{ first_name: string; last_name: string; email: string | null; phone: string | null; status: string; custom_fields: Record<string, string> | null }> }
> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from("candidates")
    .select("first_name, last_name, email, phone, status, custom_fields")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true })
  if (error) return { error: error.message }
  return {
    candidates: (data ?? []).map((c) => ({
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
  const { error: candidateErr } = await supabase.from("candidates").delete().eq("campaign_id", campaignId)
  if (candidateErr) return { error: candidateErr.message }
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/campaigns")
  redirect("/dashboard/campaigns")
}

export async function archiveCampaignAction(campaignId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
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

  const update: TablesUpdate<"campaigns"> = {
    meta_form_id: meta_form_id || null,
    meta_form_name: meta_form_name || null,
    meta_field_mapping,
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


// Veröffentlicht eine Kampagne als Jobangebot auf Kanzleistelle24 (Direct-DB-Insert über
// den Service-Key, siehe publishCampaignToKanzleistelle) - manuell ausgelöst über den
// Button auf der Kampagnen-Detailseite, siehe campaign-detail.tsx.
export async function publishCampaignToKanzleistelleAction(
  campaignId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nicht eingeloggt." }

  try {
    await publishCampaignToKanzleistelle(campaignId)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return { success: true }
}

export async function refreshLeadtableCampaignAction(
  campaignId: string
): Promise<
  { success: true; newCandidates: number; archived: boolean } | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nicht eingeloggt." }

  const { data: campaign, error: fetchError } = await supabase
    .from("campaigns")
    .select("id, title, status, leadtable_campaign_id, client_id, clients(leadtable_customer_id)")
    .eq("id", campaignId)
    .single()

  if (fetchError || !campaign) return { success: false, error: "Kampagne nicht gefunden." }
  if (!campaign.leadtable_campaign_id) {
    return { success: false, error: "Keine Leadtable-Kampagnen-ID hinterlegt, kein Abgleich möglich." }
  }

  const clientRow = Array.isArray(campaign.clients) ? campaign.clients[0] : campaign.clients
  const leadtableCustomerId = clientRow?.leadtable_customer_id ?? null

  // Archiviert-Status: es gibt bei Leadtable keinen Single-Item-GET für eine Kampagne,
  // nur /campaign/all/{customerId} als Liste (siehe fetchAllCampaigns) - deshalb wird
  // hier die komplette Kampagnenliste des zugehörigen Kunden geladen und per _id
  // gefiltert. Ohne bekannte Leadtable-Kunden-ID (Client nicht verknüpft oder ohne
  // eigene leadtable_customer_id) wird der Archiviert-Check übersprungen, statt den
  // ganzen Abgleich abzubrechen - das Nachholen neuer Kandidaten funktioniert davon
  // unabhängig.
  let archived = false

  if (leadtableCustomerId) {
    try {
      const leadtableCampaigns = await fetchAllCampaigns(leadtableCustomerId)
      const match = leadtableCampaigns.find((c) => c._id === campaign.leadtable_campaign_id)
      archived = match?.archived ?? false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Leadtable-API-Fehler beim Archiviert-Check: ${message}` }
    }

    if (archived && campaign.status !== ARCHIVED_STATUS) {
      const { error: archiveError } = await supabase
        .from("campaigns")
        .update({ status: ARCHIVED_STATUS })
        .eq("id", campaignId)
      if (archiveError) return { success: false, error: `Fehler beim Archivieren: ${archiveError.message}` }
    }
  }

  let importResult
  try {
    importResult = await importLeadtableCampaign(
      leadtableCustomerId ?? "",
      campaign.leadtable_campaign_id,
      campaign.title,
      campaign.id
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Import neuer Kandidaten fehlgeschlagen: ${message}` }
  }

  // Matching pro neuem Kandidaten einzeln anstoßen (nicht fatal, falls ein einzelner
  // Match-Lauf fehlschlägt - siehe gleiches Muster in updateCampaignSettingsAction oben).
  for (const candidateId of importResult.createdCandidateIds) {
    try {
      await matchCandidateToCampaigns(supabase, candidateId)
    } catch (matchError) {
      console.error("Matching fehlgeschlagen für neuen Kandidaten", candidateId, matchError)
    }
  }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)

  return { success: true, newCandidates: importResult.created, archived }
}

// Für den Seite-/Formular-Auswähler im Meta-Lead-Form-Feld (settings-tab.tsx) -
// analog zum Leadtable-Direktintegrations-Dialog: erst Seite wählen, dann Formular
// dieser Seite, statt eine rohe Formular-ID von Hand einzutippen.
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

