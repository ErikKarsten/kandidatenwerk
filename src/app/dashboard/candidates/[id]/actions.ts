"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

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
  const custom_fields_json = formData.get("custom_fields_json") as string

  let custom_fields: Record<string, string> = {}
  try {
    custom_fields = JSON.parse(custom_fields_json || "{}")
  } catch {
    custom_fields = {}
  }

  const { error } = await supabase
    .from("candidates")
    .update({ first_name, last_name, email: email || null, phone: phone || null, custom_fields })
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
