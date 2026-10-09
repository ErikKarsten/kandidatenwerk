import { Sidebar } from "@/components/layout/sidebar"
import { ResponsiveShell } from "@/components/layout/responsive-shell"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getAgencyLogoUrl } from "@/lib/agency-logo"
import { OPEN_BUG_REPORT_STATUSES } from "@/lib/bug-reports/shared"
import type { SupabaseClient } from "@supabase/supabase-js"
import { loadBerufsbilder } from "@/lib/berufsbilder-server"
import { BerufsbildProvider } from "@/components/berufsbild-context"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  // Vorher: 3 Zähl-Queries + auth.getUser() liefen nacheinander (je ein await) - reine
  // Netzwerk-Latenz, gemessen ~600-650ms Unterschied zu parallel, auf JEDER Seite im
  // Dashboard, da dieses Layout überall drumherum liegt. Jetzt gebündelt in einem
  // Promise.all(). myOpenTasksCount bleibt zwangsläufig ein zweiter Schritt danach, da
  // die Query erst mit der user.id aus auth.getUser() gestellt werden kann - keine
  // vermeidbare Sequenzialität, sondern eine echte Abhängigkeit.
  const [
    { count: candidatesCount },
    { count: clientsCount },
    { data: { user } },
    logoUrl,
    berufsbilder,
  ] = await Promise.all([
    supabase.from("candidates").select("id", { count: "exact", head: true }).eq("is_demo", false),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.auth.getUser(),
    getAgencyLogoUrl(),
    loadBerufsbilder(),
  ])

  // Offene Team-Aufgaben (Paket 44) werden in derselben Runde geladen und erst hier dem
  // eigenen Team zugerechnet - sonst bräuchte es eine dritte Runde für profile.team.
  const [{ count: ownOpenTasks }, { data: openTeamTasks }, { data: profile }] = user
    ? await Promise.all([
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id)
          .eq("status", "offen"),
        supabase.from("tasks").select("assigned_team").eq("status", "offen").not("assigned_team", "is", null),
        supabase.from("profiles").select("full_name, email, role, agency_id, team").eq("id", user.id).single(),
      ])
    : [{ count: 0 }, { data: [] }, { data: null }]
  const myOpenTasksCount = (ownOpenTasks ?? 0) + (openTeamTasks ?? []).filter((t) => profile?.team && t.assigned_team === profile.team).length

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
    <ResponsiveShell
      title="Kandidatenwerk"
      sidebar={
        <Sidebar
          candidatesCount={candidatesCount ?? 0}
          clientsCount={clientsCount ?? 0}
          myOpenTasksCount={myOpenTasksCount}
          userName={profile?.full_name || profile?.email || "Unbekannt"}
          isAdmin={isAdmin}
          openBugReportsCount={openBugReportsCount}
          logoUrl={logoUrl}
        />
      }
    >
      <BerufsbildProvider options={berufsbilder}>{children}</BerufsbildProvider>
    </ResponsiveShell>
  )
}
