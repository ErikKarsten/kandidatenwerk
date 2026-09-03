import { Sidebar } from "@/components/layout/sidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  // Vorher: 3 Zähl-Queries + auth.getUser() liefen nacheinander (je ein await) - reine
  // Netzwerk-Latenz, gemessen ~600-650ms Unterschied zu parallel, auf JEDER Seite im
  // Dashboard, da dieses Layout überall drumherum liegt. Jetzt gebündelt in einem
  // Promise.all(). myOpenTasksCount bleibt zwangsläufig ein zweiter Schritt danach, da
  // die Query erst mit der user.id aus auth.getUser() gestellt werden kann - keine
  // vermeidbare Sequenzialität, sondern eine echte Abhängigkeit.
  const [
    { count: matchesCount },
    { count: candidatesCount },
    { count: clientsCount },
    { data: { user } },
  ] = await Promise.all([
    supabase.from("candidate_campaign_matches").select("id", { count: "exact", head: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.auth.getUser(),
  ])

  const { count: myOpenTasksCount } = user
    ? await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", user.id)
        .eq("status", "offen")
    : { count: 0 }

  return (
    <div className="flex h-full">
      <Sidebar
        matchesCount={matchesCount ?? 0}
        candidatesCount={candidatesCount ?? 0}
        clientsCount={clientsCount ?? 0}
        myOpenTasksCount={myOpenTasksCount ?? 0}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
