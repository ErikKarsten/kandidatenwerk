"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export async function updateCampaignSettingsAction(
  campaignId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const meta_form_id = formData.get("meta_form_id") as string
  const meta_field_mapping_json = formData.get("meta_field_mapping_json") as string

  let meta_field_mapping: Record<string, string> = {}
  try {
    meta_field_mapping = JSON.parse(meta_field_mapping_json || "{}")
  } catch {
    meta_field_mapping = {}
  }

  const { error } = await supabase
    .from("campaigns")
    .update({
      meta_form_id: meta_form_id || null,
      meta_field_mapping,
    })
    .eq("id", campaignId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}
