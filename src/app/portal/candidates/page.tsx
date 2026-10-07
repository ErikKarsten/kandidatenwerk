import { PortalCandidateRow } from "@/components/portal/portal-candidate-row"
import { berufsbildLabel } from "@/lib/berufsbild"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { assignmentStatusLabel } from "@/lib/assignment-status"
import { isPortalVisible } from "@/lib/portal-visibility"


export default async function PortalCandidatesPage() {
  const supabase = await createSupabaseServerClient()

  // RLS filtert automatisch auf die eigenen, aktiven Zuordnungen (siehe
  // "Kunde sieht eigene Zuordnungen (nur lesend)" in
  // 20260907000001_client_portal_rls_foundation.sql) - kein zusätzliches .eq() auf
  // client_id nötig oder möglich (der Client kennt seine eigene client_id serverseitig
  // ja nicht direkt in dieser Query, das übernimmt die Policy).
  const { data: assignments } = await supabase
    .from("client_assignments")
    .select("id, status, candidates(id, first_name, last_name, berufsbild, plz, status, is_demo)")
    .order("created_at", { ascending: false })

  const rows = (assignments ?? []).filter((a) => a.candidates && isPortalVisible(a.candidates))

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Meine Kandidaten</h1>
      <p className="text-sm text-gray-500 mb-6">
        {rows.length} {rows.length === 1 ? "Kandidat" : "Kandidaten"} aktuell zugeordnet
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-gray-400">Aktuell sind dir noch keine Kandidaten zugeordnet.</p>
      )}

      <div className="flex flex-col gap-2">
        {rows.map((a) => {
          const c = a.candidates!
          return (
            <PortalCandidateRow
              key={a.id}
              assignmentId={a.id}
              href={`/portal/candidates/${c.id}`}
              name={`${c.first_name} ${c.last_name}`.trim()}
              meta={[berufsbildLabel(c.berufsbild), c.plz].filter(Boolean).join(" · ")}
              status={assignmentStatusLabel(a.status)}
            />
          )
        })}
      </div>
    </div>
  )
}
