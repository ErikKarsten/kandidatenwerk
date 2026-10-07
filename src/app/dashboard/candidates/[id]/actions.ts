"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext, requireStaffUser } from "@/lib/auth-guards"
import { geocodePlz } from "@/lib/geocode-plz"
import { matchCandidateToCampaigns } from "@/lib/matching"
import { ensureCampaignAssignment } from "@/lib/client-assignment"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { triggerAutomationsNow } from "@/lib/automation-trigger"
import { normalizeTags } from "@/lib/candidate-tags"

export async function updateCandidateProfileAction(
  candidateId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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

export async function saveDescriptionAction(
  candidateId: string,
  notes: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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

export async function deleteNoteAction(
  historyEntryId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // Nur "note"-Einträge sind löschbar - automatische Einträge (z.B. status_change)
  // bleiben als unveränderliches Prüfprotokoll erhalten. .eq("type", "note") schützt
  // das serverseitig ab, nicht nur durchs Ausblenden des Lösch-Icons im UI (siehe
  // history-section.tsx). Betrifft der Filter keine Zeile (falsche ID oder kein
  // note-Eintrag), liefert .single() einen Fehler statt still nichts zu tun.
  const { data, error } = await supabase
    .from("candidate_history")
    .delete()
    .eq("id", historyEntryId)
    .eq("type", "note")
    .select("candidate_id")
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${data.candidate_id}`)
  return null
}

export async function uploadFileAction(
  candidateId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
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
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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

// ── client_assignments (Kanzlei-Zuordnung mit Status-Pipeline) ────────────────────

export async function removeClientAssignmentAction(
  assignmentId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // Soft-Delete statt DELETE - removed_at markiert das Ende der Zuordnung, die
  // Historie (wer war wann bei welcher Kanzlei) bleibt erhalten.
  const { data, error } = await supabase
    .from("client_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("candidate_id")
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${data.candidate_id}`)
  return null
}

export async function updateAssignmentStatusAction(
  assignmentId: string,
  status: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // .is("removed_at", null) - nur die aktive Zuordnung darf im Status verändert
  // werden, eine bereits entfernte (historische) Zuordnung bleibt unveränderlich.
  const { data, error } = await supabase
    .from("client_assignments")
    .update({ status })
    .eq("id", assignmentId)
    .is("removed_at", null)
    .select("candidate_id")
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${data.candidate_id}`)
  return null
}

// ── Berufsbild direkt im Kopf des Kandidatenprofils ändern (Atlas T-34) ──────────

export async function updateCandidateBerufsbildAction(
  candidateId: string,
  berufsbild: string | null
): Promise<{ error: string } | null> {
  if (berufsbild && !BERUFSBILD_OPTIONS.some((o) => o.value === berufsbild)) {
    return { error: "Unbekanntes Berufsbild." }
  }

  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const { data: before } = await supabase.from("candidates").select("berufsbild").eq("id", candidateId).maybeSingle()
  if (!before) return { error: "Kandidat nicht gefunden." }
  if ((before.berufsbild ?? null) === (berufsbild || null)) return null

  const { error } = await supabase.from("candidates").update({ berufsbild: berufsbild || null }).eq("id", candidateId)
  if (error) return { error: error.message }

  const label = (value: string | null) => BERUFSBILD_OPTIONS.find((o) => o.value === value)?.label ?? "keins"
  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Berufsbild geändert: ${label(before.berufsbild)} → ${label(berufsbild || null)}`,
    created_by: guard.staff.userId,  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  // Neues Berufsbild -> passende Kanzlei-Kampagnen neu suchen (nicht fatal).
  try {
    await matchCandidateToCampaigns(supabase, candidateId)
  } catch (err) {
    console.error("Matching nach Berufsbild-Änderung fehlgeschlagen:", err)
  }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

// ── Zuordnung zu einer Kanzlei-Kampagne (Atlas T-35/T-36, 1:n) ────────────────────

export async function assignToCampaignAction(
  candidateId: string,
  campaignId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  try {
    // Mails dazu laufen ausschließlich über die Automatisierungen der Kampagne (Auslöser
    // "Kandidat der Kampagne zugeordnet", Paket 21).
    await ensureCampaignAssignment(supabase, candidateId, campaignId, guard.staff.userId)
    triggerAutomationsNow([campaignId])
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("title, client_id, clients(name)")
    .eq("id", campaignId)
    .maybeSingle()
  const clientRel = campaign?.clients as { name: string } | { name: string }[] | null | undefined
  const clientName = Array.isArray(clientRel) ? clientRel[0]?.name : clientRel?.name
  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Zugeordnet zu Kampagne „${campaign?.title ?? campaignId}“${clientName ? ` (${clientName})` : ""}`,
    created_by: guard.staff.userId,  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  if (campaign?.client_id) revalidatePath(`/dashboard/clients/${campaign.client_id}`)
  return null
}

// Beispiel-Lead samt Beispielkampagne löschen (Paket 18, T-82). Nur für Demo-Kandidaten.
export async function deleteDemoCandidateAction(candidateId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: candidate } = await supabase.from("candidates").select("is_demo").eq("id", candidateId).maybeSingle()
  if (!candidate?.is_demo) return { error: "Nur Beispiel-Leads lassen sich hier löschen." }
  const { data: links } = await supabase
    .from("client_assignments")
    .select("client_id, campaign_id, campaigns(is_demo)")
    .eq("candidate_id", candidateId)
  const demoCampaignIds = (links ?? [])
    .filter((l) => (Array.isArray(l.campaigns) ? l.campaigns[0]?.is_demo : (l.campaigns as { is_demo: boolean } | null)?.is_demo))
    .map((l) => l.campaign_id as string)

  const { error } = await supabase.from("candidates").delete().eq("id", candidateId)
  if (error) return { error: error.message }
  if (demoCampaignIds.length > 0) {
    const { error: campaignError } = await supabase.from("campaigns").delete().in("id", demoCampaignIds).eq("is_demo", true)
    if (campaignError) return { error: `Beispiel-Lead gelöscht, Beispielkampagne nicht: ${campaignError.message}` }
  }
  for (const clientId of new Set((links ?? []).map((l) => l.client_id))) revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/candidates")
  return null
}

// Tags eines Kandidaten setzen (Paket 28, T-115).
export async function updateCandidateTagsAction(candidateId: string, tags: string[]): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const { error } = await supabase.from("candidates").update({ tags: normalizeTags(tags) }).eq("id", candidateId)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${candidateId}`)
  revalidatePath("/dashboard/candidates")
  return null
}
