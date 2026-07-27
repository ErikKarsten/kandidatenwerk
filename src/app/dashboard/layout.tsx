import { Sidebar } from "@/components/layout/sidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const { count: matchesCount } = await supabase
    .from("candidate_campaign_matches")
    .select("id", { count: "exact", head: true })

  return (
    <div className="flex h-full">
      <Sidebar matchesCount={matchesCount ?? 0} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
