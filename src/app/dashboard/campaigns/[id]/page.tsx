import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getAutomationTemplates } from "../../einstellungen/automation-template-actions"
import { CampaignDetail } from "./campaign-detail"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  // Automatisierungs-Vorlagen und -Sets der Agentur (Paket 15, T-74) für den Reiter
  // Automatisierungen (automations-tab.tsx).
  const automationTemplates = await getAutomationTemplates()

  const [{ data: campaign }, { data: candidates }, { data: automations }, { data: clientRows }, { data: templateRows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, clients(id, name)")
      .eq("id", id)
      .single(),
    // Herkunft: Kandidaten, deren Bewerbung über diese Kampagne kam (Lead-Kampagnen).
    supabase
      .from("candidates")
      .select("id, first_name, last_name, email, phone, status, berufsbild, plz, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_automations")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true }),
    // Für die "Duplizieren"/"Verschieben"-Kunde-Auswahl (campaign-detail.tsx).
    supabase.from("clients").select("id, name").order("name", { ascending: true }),
    supabase.from("field_templates").select("id, name, is_default").order("name"),
  ])

  if (!campaign) notFound()

  // Kanzlei-Kampagnen (Atlas T-40): Reiter "Kandidaten" zeigt die dieser Kampagne
  // ZUGEORDNETEN Kandidaten, nicht die Herkunft. Alt-Kandidaten aus dem Leadtable-
  // Import (candidates.campaign_id) werden bewusst nicht mehr gezeigt - sie stehen in
  // "Alle Kandidaten" und werden über "Passende Kandidaten" neu zugeordnet.
  let shownCandidates = candidates ?? []
  if (campaign.kind === "kanzlei") {
    const { data: assignmentRows } = await supabase
      .from("client_assignments")
      .select("created_at, candidates(id, first_name, last_name, email, phone, status, berufsbild, plz, created_at)")
      .eq("campaign_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false })
    type AssignedCandidateJoin = NonNullable<typeof candidates>[number]
    shownCandidates = (assignmentRows ?? [])
      .map((a) => (Array.isArray(a.candidates) ? a.candidates[0] : a.candidates) as AssignedCandidateJoin | null)
      .filter((c): c is AssignedCandidateJoin => c !== null)
  }

  const client = Array.isArray(campaign.clients)
    ? campaign.clients[0] ?? null
    : (campaign.clients as { id: string; name: string } | null)

  return (
    <CampaignDetail
      campaign={{
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        status: campaign.status,
        meta_campaign_id: campaign.meta_campaign_id,
        meta_form_id: campaign.meta_form_id ?? null,
        meta_form_name: campaign.meta_form_name ?? null,
        meta_field_mapping: (campaign.meta_field_mapping as string[] | null) ?? null,
        berufsbild: campaign.berufsbild ?? null,
        plz: campaign.plz ?? null,
        lat: campaign.lat ?? null,
        lng: campaign.lng ?? null,
        radius_km: campaign.radius_km ?? null,
        leadtable_campaign_id: campaign.leadtable_campaign_id ?? null,
        kanzleistelle_job_id: campaign.kanzleistelle_job_id ?? null,
        kind: campaign.kind,
        field_template_id: campaign.field_template_id ?? null,
        meta_webhook_last_test_at: campaign.meta_webhook_last_test_at ?? null,
        client,
      }}
      candidates={shownCandidates}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      automations={(automations ?? []) as any}
      automationTemplates={automationTemplates}
      clients={clientRows ?? []}
      fieldTemplates={templateRows ?? []}
    />
  )
}
