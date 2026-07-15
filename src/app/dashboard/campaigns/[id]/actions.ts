"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { geocodePlz } from "@/lib/geocode-plz"
import type { TablesUpdate } from "@/types/database"

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

  const update: TablesUpdate<"campaigns"> = {
    meta_form_id: meta_form_id || null,
    meta_field_mapping,
  }

  if (formData.has("berufsbild")) {
    update.berufsbild = (formData.get("berufsbild") as string) || null
  }
  if (formData.has("plz")) {
    const plz = (formData.get("plz") as string) || ""
    const coords = plz ? geocodePlz(plz) : null
    update.plz = plz || null
    update.lat = coords?.lat ?? null
    update.lng = coords?.lng ?? null
  }
  if (formData.has("radius_km")) {
    const radiusRaw = formData.get("radius_km") as string
    update.radius_km = radiusRaw ? parseInt(radiusRaw, 10) : 25
  }

  const { error } = await supabase
    .from("campaigns")
    .update(update)
    .eq("id", campaignId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}
