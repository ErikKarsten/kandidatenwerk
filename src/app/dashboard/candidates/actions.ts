"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export type CreateCandidateState = { error: string } | null

export async function createCandidateAction(
  _prev: CreateCandidateState,
  formData: FormData
): Promise<CreateCandidateState> {
  const first_name = formData.get("first_name") as string
  const last_name = formData.get("last_name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const status = (formData.get("status") as string) || "neu"
  const source = "manual"
  const notes = formData.get("notes") as string
  const campaign_id = formData.get("campaign_id") as string
  const redirect_to = (formData.get("redirect_to") as string) || "/dashboard/candidates"

  if (!first_name) return { error: "Vorname ist ein Pflichtfeld." }
  if (!last_name) return { error: "Nachname ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase.from("candidates").insert({
    first_name,
    last_name,
    email: email || null,
    phone: phone || null,
    status,
    source,
    notes: notes || null,
    campaign_id: campaign_id || null,
  })

  if (error) return { error: error.message }

  redirect(redirect_to)
}

export async function updateCandidateStatusAction(
  candidateId: string,
  status: string,
  campaignId?: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: existing } = await supabase
    .from("candidates")
    .select("status")
    .eq("id", candidateId)
    .single()

  const { error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", candidateId)

  if (error) return { error: error.message }

  if (existing) {
    await supabase.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "status_change",
      content: `Status geändert: ${existing.status} → ${status}`,
      created_by: user.id,
    })
  }

  if (campaignId) revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath("/dashboard/candidates")
  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return null
}
