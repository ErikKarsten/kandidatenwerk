"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { geocodePlz } from "@/lib/geocode-plz"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { matchCampaignToCandidates, matchCandidateToCampaigns } from "@/lib/matching"
import { fetchAllCampaigns } from "@/lib/leadtable-import-customers"
import { importLeadtableCampaign } from "@/lib/leadtable-import"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import type { TablesUpdate } from "@/types/database"

// Siehe src/app/dashboard/candidates/page.tsx / clients-list.tsx / campaigns-list.tsx -
// derselbe Wert wird dort für "isArchived"-Prüfungen genutzt.
const ARCHIVED_STATUS = "Archiviert"

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
