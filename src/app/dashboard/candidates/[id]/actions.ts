"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { geocodePlz } from "@/lib/geocode-plz"
import { matchCandidateToCampaigns } from "@/lib/matching"
import { leadtableFetch } from "@/lib/leadtable-client"
import {
  type LeadtableSyncLead,
  withRetry,
  mapLeadtableStatus,
  htmlDescriptionToPlainText,
  extractLeadtableCustomFields,
  findLeadByEmailWithFallback,
} from "@/lib/leadtable-sync-shared"
import type { Json } from "@/types/database"

export async function updateCandidateProfileAction(
  candidateId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const first_name = formData.get("first_name") as string
  const last_name = formData.get("last_name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const berufsbild = formData.get("berufsbild") as string
  const plz = formData.get("plz") as string
  const custom_fields_json = formData.get("custom_fields_json") as string

  let custom_fields: Record<string, string> = {}
  try {
    custom_fields = JSON.parse(custom_fields_json || "{}")
  } catch {
    custom_fields = {}
  }

  const { data: before } = await supabase
    .from("candidates")
    .select("berufsbild, plz")
    .eq("id", candidateId)
    .single()

  const coords = plz ? geocodePlz(plz) : null

  const { error } = await supabase
    .from("candidates")
    .update({
      first_name,
      last_name,
      email: email || null,
      phone: phone || null,
      berufsbild: berufsbild || null,
      plz: plz || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      custom_fields,
    })
    .eq("id", candidateId)

  if (error) return { error: error.message }

  const berufsbildChanged = (before?.berufsbild ?? null) !== (berufsbild || null)
  const plzChanged = (before?.plz ?? null) !== (plz || null)
  if (berufsbildChanged || plzChanged) {
    try {
      await matchCandidateToCampaigns(supabase, candidateId)
    } catch (matchError) {
      console.error("Matching fehlgeschlagen für Kandidat", candidateId, matchError)
    }
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function updateCandidateCustomFieldAction(
  candidateId: string,
  key: string,
  value: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: existing, error: fetchError } = await supabase
    .from("candidates")
    .select("custom_fields")
    .eq("id", candidateId)
    .single()

  if (fetchError) return { error: fetchError.message }

  const existingFields = (existing?.custom_fields as Record<string, string> | null) ?? {}
  const trimmed = value.trim()
  const updatedFields = { ...existingFields }
  if (trimmed === "") {
    delete updatedFields[key]
  } else {
    updatedFields[key] = trimmed
  }

  const { error } = await supabase
    .from("candidates")
    .update({ custom_fields: updatedFields })
    .eq("id", candidateId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function refreshLeadtableCandidateAction(
  candidateId: string
): Promise<{ success: true; changedFields: string[] } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nicht eingeloggt." }

  const { data: candidate, error: fetchError } = await supabase
    .from("candidates")
    .select("id, source, status, description, custom_fields, leadtable_lead_id, email, campaign_id")
    .eq("id", candidateId)
    .single()

  if (fetchError || !candidate) return { success: false, error: "Kandidat nicht gefunden." }
  if (candidate.source !== "leadtable") {
    return { success: false, error: "Kein Leadtable-Kandidat, kein Abgleich möglich." }
  }

  let lead: LeadtableSyncLead | undefined
  let newLeadId: string | null = null

  try {
    if (candidate.leadtable_lead_id) {
      const resp = await withRetry(() =>
        leadtableFetch<{ lead: LeadtableSyncLead }>(`/lead/${candidate.leadtable_lead_id}`)
      )
      lead = resp.lead
    } else {
      const email = (candidate.email ?? "").trim().split(/\s+/)[0]
      if (!email) return { success: false, error: "Kandidat hat keine E-Mail-Adresse, kein Leadtable-Abgleich möglich." }

      let leadtableCampaignId: string | null = null
      if (candidate.campaign_id) {
        const { data: campaignRow } = await supabase
          .from("campaigns")
          .select("leadtable_campaign_id")
          .eq("id", candidate.campaign_id)
          .maybeSingle()
        leadtableCampaignId = campaignRow?.leadtable_campaign_id ?? null
      }

      lead = (await findLeadByEmailWithFallback(email, leadtableCampaignId)) ?? undefined
      if (lead) newLeadId = lead._id
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("404")) {
      return { success: false, error: "Kandidat bei Leadtable nicht mehr auffindbar." }
    }
    return { success: false, error: `Leadtable-API-Fehler: ${message}` }
  }

  if (!lead) return { success: false, error: "Kandidat bei Leadtable nicht mehr auffindbar." }

  const changedFields: string[] = []

  // leadtable_lead_id best-effort speichern (Unique-Konflikt bei Mehrfach-Bewerbungen
  // derselben E-Mail auf verschiedene Kampagnen darf den restlichen Sync nicht
  // verhindern, siehe scripts/leadtable-status-sync.ts).
  if (newLeadId) {
    await supabase.from("candidates").update({ leadtable_lead_id: newLeadId }).eq("id", candidateId)
  }

  // Status: 1:1-Mapping, unbekannter Leadtable-Status lässt den Status unverändert,
  // blockiert aber nicht die anderen Felder.
  const mappedStatus = mapLeadtableStatus(lead)
  if (mappedStatus && mappedStatus !== candidate.status) {
    const { error: statusError } = await supabase
      .from("candidates")
      .update({ status: mappedStatus })
      .eq("id", candidateId)
    if (statusError) return { success: false, error: `Fehler beim Status-Update: ${statusError.message}` }
    changedFields.push("Status")
  }

  // Beschreibung: bei explizitem manuellem Klick ist "aktueller Leadtable-Stand"
  // ausdrücklich gewollt, anders als beim einmaligen Bulk-Import wird hier immer
  // überschrieben.
  const rawHtml = lead.description?.trim() ?? ""
  if (rawHtml !== "") {
    const description = htmlDescriptionToPlainText(rawHtml)
    if (description !== "" && description !== candidate.description) {
      const { error: descriptionError } = await supabase
        .from("candidates")
        .update({ description })
        .eq("id", candidateId)
      if (descriptionError) return { success: false, error: `Fehler beim Beschreibung-Update: ${descriptionError.message}` }
      changedFields.push("Beschreibung")
    }
  }

  // Zusatzfelder: wie beim Backfill nur Lücken füllen, bestehende Werte gewinnen.
  const newCustomFields = extractLeadtableCustomFields(lead.modifiedData)
  const existingFields = (candidate.custom_fields as Record<string, string> | null) ?? {}
  const fieldsToAdd = Object.keys(newCustomFields).filter(
    (key) => !(typeof existingFields[key] === "string" && existingFields[key].trim() !== "")
  )
  if (fieldsToAdd.length > 0) {
    const mergedFields: Record<string, string> = { ...newCustomFields, ...existingFields }
    const { error: fieldsError } = await supabase
      .from("candidates")
      .update({ custom_fields: mergedFields as Json })
      .eq("id", candidateId)
    if (fieldsError) return { success: false, error: `Fehler beim Zusatzfelder-Update: ${fieldsError.message}` }
    changedFields.push("Zusatzfelder")
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return { success: true, changedFields }
}

export async function saveDescriptionAction(
  candidateId: string,
  notes: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase
    .from("candidates")
    .update({ notes: notes || null })
    .eq("id", candidateId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function addNoteAction(
  candidateId: string,
  content: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content,
    ...(user ? { created_by: user.id } : {}),
  })

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function uploadFileAction(
  candidateId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const file = formData.get("file") as File | null
  if (!file) return { error: "Keine Datei ausgewählt." }

  const storagePath = `${candidateId}/${Date.now()}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("candidate-files")
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { error: insertError } = await supabase.from("candidate_files").insert({
    candidate_id: candidateId,
    file_name: file.name,
    file_path: storagePath,
    file_size: file.size,
    mime_type: file.type || null,
  })

  if (insertError) {
    await supabase.storage.from("candidate-files").remove([storagePath])
    return { error: insertError.message }
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function archiveCandidateAction(
  candidateId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("candidates")
    .update({ status: "Archiviert" })
    .eq("id", candidateId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/candidates")
  return null
}

export async function deleteCandidateAction(
  candidateId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  // Delete storage files first (DB rows CASCADE on candidate delete)
  const { data: files } = await supabase
    .from("candidate_files")
    .select("file_path")
    .eq("candidate_id", candidateId)

  if (files && files.length > 0) {
    await supabase.storage
      .from("candidate-files")
      .remove(files.map((f) => f.file_path))
  }

  const { error } = await supabase.from("candidates").delete().eq("id", candidateId)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/candidates")
  return null
}

export async function deleteFileAction(
  fileId: string,
  storagePath: string,
  candidateId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  await supabase.storage.from("candidate-files").remove([storagePath])

  const { error } = await supabase
    .from("candidate_files")
    .delete()
    .eq("id", fileId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}
