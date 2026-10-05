import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import {
  getTeamMembers,
  getEmailTemplates,
  getLeadNotificationRecipientIds,
  getCustomFieldDefinitions,
  getPendingCustomFieldReviewQueue,
} from "./actions"
import { EinstellungenDetail } from "./einstellungen-detail"
import { getFieldTemplates, getLeadForms } from "./field-actions"
import { getLeadCampaignsOverview } from "@/lib/meta-campaigns-queries"
import type { SupabaseClient } from "@supabase/supabase-js"

export default async function EinstellungenPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role, agency_id")
    .eq("id", user.id)
    .single()

  // Portal-Nutzer (role "client") haben laut Spezifikation keinen Zugriff auf
  // interne Bereiche - middleware.ts sichert /dashboard/* bereits ab, das hier ist
  // nur das zweite Sicherheitsnetz, gleiches Prinzip wie an anderen Stellen.
  if (!ownProfile || ownProfile.role === "client") redirect("/portal")

  const { data: agency } = ownProfile.agency_id
    ? await supabase.from("agencies").select("id, name").eq("id", ownProfile.agency_id).single()
    : { data: null }

  const team = ownProfile.agency_id ? await getTeamMembers(ownProfile.agency_id) : []
  const emailTemplates = ownProfile.agency_id ? await getEmailTemplates(ownProfile.agency_id) : []
  const leadNotificationRecipientIds = ownProfile.agency_id
    ? await getLeadNotificationRecipientIds(ownProfile.agency_id)
    : []
  const customFieldDefinitions = ownProfile.agency_id ? await getCustomFieldDefinitions() : []
  const customFieldReviewQueue = ownProfile.agency_id ? await getPendingCustomFieldReviewQueue() : []
  const metaCampaigns = ownProfile.agency_id ? await getLeadCampaignsOverview(supabase as unknown as SupabaseClient) : []
  const [fieldTemplates, leadForms] = ownProfile.agency_id ? await Promise.all([getFieldTemplates(), getLeadForms()]) : [[], []]
  // Hinweise des letzten Meta-Lead-Abgleichs (z.B. Seite nicht freigegeben, T-65).
  const { data: lastLeadsRun } = await (supabase as unknown as SupabaseClient)
    .from("cron_job_runs")
    .select("summary")
    .eq("job", "meta-leads-sync")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const leadSyncWarnings = ((lastLeadsRun?.summary as { warnings?: { campaignId: string; campaignTitle: string; message: string }[] } | null)?.warnings ?? [])

  return (
    <EinstellungenDetail
      ownProfile={{
        id: ownProfile.id,
        full_name: ownProfile.full_name,
        email: user.email ?? null,
        role: ownProfile.role as "agency_admin" | "agency_member",
      }}
      agencyName={agency?.name ?? ""}
      team={team}
      agencyId={ownProfile.agency_id}
      emailTemplates={emailTemplates}
      leadNotificationRecipientIds={leadNotificationRecipientIds}
      customFieldDefinitions={customFieldDefinitions}
      customFieldReviewQueue={customFieldReviewQueue}
      metaCampaigns={metaCampaigns}
      fieldTemplates={fieldTemplates}
      leadForms={leadForms}
      leadSyncWarnings={leadSyncWarnings}
    />
  )
}
