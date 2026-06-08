import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CandidateDetail } from "./candidate-detail"

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: candidate }, { data: history }, { data: fileRows }] = await Promise.all([
    supabase
      .from("candidates")
      .select("*, campaigns(title, meta_field_mapping, clients(id, name))")
      .eq("id", id)
      .single(),
    supabase
      .from("candidate_history")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidate_files")
      .select("*")
      .eq("candidate_id", id)
      .order("created_at", { ascending: false }),
  ])

  if (!candidate) notFound()

  const files = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from("candidate-files")
        .createSignedUrl(f.file_path, 3600)
      return {
        id: f.id,
        name: f.file_name,
        storage_path: f.file_path,
        size: f.file_size,
        mime_type: f.mime_type,
        created_at: f.created_at,
        signedUrl: urlData?.signedUrl ?? null,
      }
    })
  )

  type CampaignJoin = { title: string; meta_field_mapping: Record<string, string> | null; clients: { id: string; name: string } | null } | null
  const campaigns = candidate.campaigns as CampaignJoin

  const candidateData = {
    id: candidate.id,
    first_name: candidate.first_name,
    last_name: candidate.last_name,
    email: candidate.email,
    phone: candidate.phone,
    status: candidate.status,
    notes: candidate.notes,
    custom_fields: (candidate.custom_fields as Record<string, string> | null) ?? null,
    campaign_id: candidate.campaign_id,
    campaigns: campaigns,
  }

  return (
    <CandidateDetail
      candidate={candidateData}
      history={history ?? []}
      files={files}
      campaignMapping={campaigns?.meta_field_mapping ?? null}
    />
  )
}
