import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CampaignDetail } from "./campaign-detail"

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: campaign }, { data: candidates }, { data: automations }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("*, clients(name)")
      .eq("id", id)
      .single(),
    supabase
      .from("candidates")
      .select("id, first_name, last_name, email, phone, status, created_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_automations")
      .select("*")
      .eq("campaign_id", id)
      .order("created_at", { ascending: true }),
  ])

  if (!campaign) notFound()

  const client = Array.isArray(campaign.clients)
    ? campaign.clients[0] ?? null
    : (campaign.clients as { name: string } | null)

  return (
    <CampaignDetail
      campaign={{
        id: campaign.id,
        title: campaign.title,
        description: campaign.description,
        status: campaign.status,
        meta_campaign_id: campaign.meta_campaign_id,
        meta_form_id: campaign.meta_form_id ?? null,
        meta_field_mapping: (campaign.meta_field_mapping as string[] | null) ?? null,
        client,
      }}
      candidates={candidates ?? []}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      automations={(automations ?? []) as any}
    />
  )
}
