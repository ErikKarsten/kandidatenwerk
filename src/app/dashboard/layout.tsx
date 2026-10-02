import { Sidebar } from "@/components/layout/sidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { OPEN_BUG_REPORT_STATUSES } from "@/lib/bug-reports/shared"
import type { SupabaseClient } from "@supabase/supabase-js"

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
    { count: qualifiedCount },
    { data: { user } },
  ] = await Promise.all([
    supabase.from("candidate_campaign_matches").select("id", { count: "exact", head: true }),
    supabase.from("candidates").select("id", { count: "exact", head: true }),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("qualified_candidates").select("id", { count: "exact", head: true }),
    supabase.auth.getUser(),
  ])

  const [{ count: myOpenTasksCount }, { data: profile }] = user
    ? await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id)
          .eq("status", "offen"),
        supabase.from("profiles").select("full_name, email, role, agency_id").eq("id", user.id).single(),
      ])
    : [{ count: 0 }, { data: null }]

  // Offene Fehlermeldungen nur für Admins zählen - bug_reports ist ohne RLS-Policy für
  // Logins (siehe 20261002000001_bug_reports.sql), daher per Admin-Client, aber streng
  // auf die eigene Agentur gefiltert. Fehlt die Tabelle noch, bleibt der Zähler 0.
  const isAdmin = profile?.role === "agency_admin"
  let openBugReportsCount = 0
  if (isAdmin && profile?.agency_id) {
    const db = createSupabaseAdminClient() as unknown as SupabaseClient
    const { count } = await db
      .from("bug_reports")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", profile.agency_id)
      .in("status", OPEN_BUG_REPORT_STATUSES)
    openBugReportsCount = count ?? 0
  }

  return (
    <div className="flex h-full">
      <Sidebar
        matchesCount={matchesCount ?? 0}
        candidatesCount={candidatesCount ?? 0}
        clientsCount={clientsCount ?? 0}
        myOpenTasksCount={myOpenTasksCount ?? 0}
        qualifiedCount={qualifiedCount ?? 0}
        userName={profile?.full_name || profile?.email || "Unbekannt"}
        isAdmin={isAdmin}
        openBugReportsCount={openBugReportsCount}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
