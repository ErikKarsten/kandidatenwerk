import { Users, Megaphone, UserSearch, TrendingUp } from "lucide-react"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ClientCard, type PipelineSegment } from "@/components/dashboard/client-card"
import { createSupabaseServerClient } from "@/lib/supabase-server"

const VALID_STATUSES = new Set(["neu", "pruefung", "interview", "vorgestellt", "platziert", "abgelehnt"])

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  const [
    { data: clients },
    { data: campaigns },
    { data: candidates },
    { count: clientCount },
    { count: campaignCount },
    { count: candidateCount },
    { count: placementCount },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, active"),
    supabase.from("campaigns").select("id, client_id"),
    supabase.from("candidates").select("campaign_id, status"),
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("campaigns").select("*", { count: "exact", head: true }),
    supabase.from("candidates").select("*", { count: "exact", head: true }),
    supabase.from("candidates").select("*", { count: "exact", head: true }).eq("status", "platziert"),
  ])

  // campaign_id -> client_id lookup
  const campaignToClient = new Map<string, string>()
  for (const c of campaigns ?? []) {
    campaignToClient.set(c.id, c.client_id)
  }

  // client_id -> campaign ids
  const clientCampaigns = new Map<string, Set<string>>()
  // client_id -> { status -> count }
  const clientStatusCounts = new Map<string, Record<string, number>>()

  for (const c of clients ?? []) {
    clientCampaigns.set(c.id, new Set())
    clientStatusCounts.set(c.id, {})
  }

  for (const camp of campaigns ?? []) {
    clientCampaigns.get(camp.client_id)?.add(camp.id)
  }

  for (const cand of candidates ?? []) {
    const clientId = cand.campaign_id ? campaignToClient.get(cand.campaign_id) : undefined
    if (!clientId) continue
    const statuses = clientStatusCounts.get(clientId)
    if (!statuses) continue
    statuses[cand.status] = (statuses[cand.status] ?? 0) + 1
  }

  const clientCards = (clients ?? []).map((client) => {
    const statuses = clientStatusCounts.get(client.id) ?? {}
    const totalCandidates = Object.values(statuses).reduce((s, v) => s + v, 0)
    const pipeline: PipelineSegment[] = Object.entries(statuses)
      .filter(([s]) => VALID_STATUSES.has(s))
      .map(([status, count]) => ({ status: status as PipelineSegment["status"], count }))

    return {
      name: client.name,
      active: client.active,
      tags: [] as string[],
      stats: {
        kandidaten: totalCandidates,
        kampagnen: clientCampaigns.get(client.id)?.size ?? 0,
        platzierungen: statuses["platziert"] ?? 0,
      },
      pipeline,
    }
  })

  const kpiData = [
    { icon: Users, label: "Kunden", value: clientCount ?? 0, iconColor: "#1e56a0" },
    { icon: Megaphone, label: "Kampagnen", value: campaignCount ?? 0, iconColor: "#4ba3c3" },
    { icon: UserSearch, label: "Kandidaten", value: candidateCount ?? 0, iconColor: "#8b5cf6" },
    { icon: TrendingUp, label: "Platzierungen", value: placementCount ?? 0, iconColor: "#1a9a6a" },
  ]

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Übersicht aller Aktivitäten und KPIs</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Kunden</h2>
          <span className="text-sm text-gray-500">{clientCards.length} Einträge</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {clientCards.map((client) => (
            <ClientCard key={client.name} {...client} />
          ))}
        </div>
      </div>
    </div>
  )
}
