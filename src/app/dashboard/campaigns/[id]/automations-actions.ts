"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export interface AutomationData {
  name: string
  trigger: string
  trigger_status: string | null
  delay_seconds: number
  active: boolean
  recipient: string
  sender_email: string
  sender_name: string
  subject: string
  body_html: string
}

export async function createAutomationAction(
  campaignId: string,
  data: AutomationData
): Promise<{ error: string } | { id: string }> {
  const supabase = await createSupabaseServerClient()
  const { data: row, error } = await supabase
    .from("campaign_automations")
    .insert({ campaign_id: campaignId, ...data })
    .select("id")
    .single()
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return { id: row.id }
}

export async function updateAutomationAction(
  id: string,
  campaignId: string,
  data: AutomationData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("campaign_automations")
    .update(data)
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}

export async function deleteAutomationAction(
  id: string,
  campaignId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("campaign_automations")
    .delete()
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}

export async function toggleAutomationActiveAction(
  id: string,
  campaignId: string,
  active: boolean
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("campaign_automations")
    .update({ active })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}
