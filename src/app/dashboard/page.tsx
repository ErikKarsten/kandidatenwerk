import { Users, Megaphone, UserSearch, TrendingUp, Inbox, Send, ClipboardCheck } from "lucide-react"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getDashboardKpis } from "@/lib/kpis"
import { getLatestLeadtableSyncRunAction } from "./actions"
import { LeadtableSyncStatus } from "./leadtable-sync-status"

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient()

  const [
    { count: clientCount },
    { count: campaignCount },
    { count: candidateCount },
    { count: placementCount },
    latestSyncRun,
    activityKpis,
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }),
    supabase.from("campaigns").select("*", { count: "exact", head: true }),
    supabase.from("candidates").select("*", { count: "exact", head: true }),
    supabase.from("candidates").select("*", { count: "exact", head: true }).eq("status", "platziert"),
    getLatestLeadtableSyncRunAction(),
    getDashboardKpis(supabase),
  ])

  const kpiData = [
    { icon: Users, label: "Kunden", value: clientCount ?? 0, iconColor: "#1e56a0", href: "/dashboard/clients" },
    { icon: Megaphone, label: "Kampagnen", value: campaignCount ?? 0, iconColor: "#4ba3c3", href: "/dashboard/campaigns" },
    { icon: UserSearch, label: "Kandidaten", value: candidateCount ?? 0, iconColor: "#8b5cf6", href: "/dashboard/candidates" },
    { icon: TrendingUp, label: "Platzierungen", value: placementCount ?? 0, iconColor: "#1a9a6a", href: "/dashboard/pipeline" },
  ]

  const activityKpiData = [
    { icon: Inbox, label: "Neue Eingänge heute", value: activityKpis.newToday, iconColor: "#4ba3c3", href: "/dashboard/candidates" },
    { icon: Send, label: "Weitergeleitet", value: activityKpis.forwarded, iconColor: "#8b5cf6" },
    { icon: ClipboardCheck, label: "Bearbeitet", value: activityKpis.processed, iconColor: "#1a9a6a", href: "/dashboard/pipeline" },
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {activityKpiData.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <LeadtableSyncStatus initialRun={latestSyncRun} />
    </div>
  )
}
