"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { applyTemplatesToCampaign, templateIdsOfSet } from "@/lib/automation-templates"

// requireStaffUser() aus src/lib/auth-guards.ts (Security-Review
// 08./09.09.2026) - diese Actions hatten bisher gar keinen Auth-Check und
// verliessen sich komplett auf RLS, die fuer campaign_automations bis dahin offen
// war. Das Feature hat keine Portal-UI, Kunden sollen hier grundsaetzlich nie
// ankommen.

export interface AutomationData {
  name: string
  trigger: string
  trigger_status: string | null
  delay_seconds: number
  active: boolean
  recipient: string
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
    .insert({ campaign_id: campaignId, ...data, active_since: data.active ? new Date().toISOString() : null })
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

  const { data: current } = await supabase.from("campaign_automations").select("active").eq("id", id).maybeSingle()
  const { error } = await supabase
    .from("campaign_automations")
    .update({ ...data, ...(data.active && !current?.active ? { active_since: new Date().toISOString() } : {}) })
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
    // Beim Einschalten zählt ab jetzt - kein Versand an Bestandskandidaten (Paket 15).
    .update(active ? { active, active_since: new Date().toISOString() } : { active })
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/campaigns/${campaignId}`)
  return null
}

// Vorlage oder Vorlagenset in die Kampagne übernehmen (Paket 15, T-74). Übernommene
// Automatisierungen starten ausgeschaltet - geschaltet wird bewusst in der Kampagne.
export async function applyAutomationTemplatesAction(
  campaignId: string,
  source: { templateId: string } | { setId: string }
): Promise<{ error: string } | { added: number }> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  try {
    const ids = "setId" in source ? await templateIdsOfSet(supabase, source.setId) : [source.templateId]
    const added = await applyTemplatesToCampaign(supabase, campaignId, ids, false)
    revalidatePath(`/dashboard/campaigns/${campaignId}`)
    return { added }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
