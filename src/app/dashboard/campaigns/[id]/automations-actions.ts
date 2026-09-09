"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Analog zu requireStaffUser() in clients/[id]/actions.ts (Security-Review
// 08./09.09.2026) - diese Actions hatten bisher gar keinen Auth-Check und
// verliessen sich komplett auf RLS, die fuer campaign_automations bis dahin offen
// war. Das Feature hat keine Portal-UI, Kunden sollen hier grundsaetzlich nie
// ankommen.
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
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

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
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { error } = await supabase
    .from("campaign_automations")
    .update({ active })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}
