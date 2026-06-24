export const runtime = 'edge';

import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CampaignsList } from "./campaigns-list"

const ARCHIVED_STATUS = "Archiviert"

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_archived?: string }>
}) {
  const { show_archived } = await searchParams
  const showArchived = show_archived === "1"

  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from("campaigns")
    .select("id, title, description, status, meta_campaign_id, created_at, clients(name)")
    .order("created_at", { ascending: false })

  if (!showArchived) {
    query = query.neq("status", ARCHIVED_STATUS)
  }

  const { data: campaigns } = await query

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kampagnen</h1>
          <p className="mt-1 text-sm text-gray-500">{campaigns?.length ?? 0} Einträge</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/dashboard/campaigns" : "/dashboard/campaigns?show_archived=1"}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
            style={{
              borderColor: showArchived ? "#1e56a0" : "#dde3ea",
              color: showArchived ? "#1e56a0" : "#6b7280",
              backgroundColor: showArchived ? "#1e56a018" : undefined,
            }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: showArchived ? "#1e56a0" : "#d1d5db" }} />
            Archivierte anzeigen
          </Link>
          <Button asChild style={{ backgroundColor: "#1e56a0" }}>
            <Link href="/dashboard/campaigns/new">
              <Plus size={16} />
              Neue Kampagne
            </Link>
          </Button>
        </div>
      </div>

      <CampaignsList campaigns={campaigns ?? []} showArchived={showArchived} />
    </div>
  )
}
