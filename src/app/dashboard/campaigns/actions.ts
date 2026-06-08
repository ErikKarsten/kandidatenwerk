"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export type CreateCampaignState = { error: string } | null

export async function createCampaignAction(
  _prev: CreateCampaignState,
  formData: FormData
): Promise<CreateCampaignState> {
  const title = formData.get("title") as string
  const client_id = formData.get("client_id") as string
  const description = formData.get("description") as string
  const status = (formData.get("status") as string) || "active"
  const meta_campaign_id = formData.get("meta_campaign_id") as string

  if (!title) return { error: "Titel ist ein Pflichtfeld." }
  if (!client_id) return { error: "Bitte einen Kunden auswählen." }

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase.from("campaigns").insert({
    title,
    client_id,
    description: description || null,
    status,
    meta_campaign_id: meta_campaign_id || null,
  })

  if (error) return { error: error.message }

  redirect("/dashboard/campaigns")
}
