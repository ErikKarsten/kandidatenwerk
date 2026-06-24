export const runtime = 'edge';

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CandidateForm } from "./candidate-form"

export default async function NewCandidatePage({
  searchParams,
}: {
  searchParams: Promise<{ campaign_id?: string }>
}) {
  const { campaign_id } = await searchParams
  const supabase = await createSupabaseServerClient()

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, clients(name)")
    .order("title", { ascending: true })

  const backHref = campaign_id
    ? `/dashboard/campaigns/${campaign_id}`
    : "/dashboard/candidates"

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Zurück
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Kandidat anlegen</h1>
      </div>

      <div className="max-w-2xl rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <CandidateForm
          campaigns={(campaigns ?? []).map((c) => ({
            id: c.id,
            title: c.title,
            clients: Array.isArray(c.clients) ? c.clients[0] ?? null : c.clients as { name: string } | null,
          }))}
          defaultCampaignId={campaign_id}
        />
      </div>
    </div>
  )
}
