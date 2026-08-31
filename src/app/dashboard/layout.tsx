import { Sidebar } from "@/components/layout/sidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { count: matchesCount } = await supabase
    .from("candidate_campaign_matches")
    .select("id", { count: "exact", head: true })
  const { count: candidatesCount } = await supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
  const { count: clientsCount } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true })
  const { count: locationsCount } = await supabase
    .from("locations")
    .select("id", { count: "exact", head: true })

  return (
    <div className="flex h-full">
      <Sidebar
        matchesCount={matchesCount ?? 0}
        candidatesCount={candidatesCount ?? 0}
        clientsCount={clientsCount ?? 0}
        locationsCount={locationsCount ?? 0}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
