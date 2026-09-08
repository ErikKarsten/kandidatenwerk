import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Gleiche deutsche Labels wie in candidates/[id]/matches-section.tsx
// (ASSIGNMENT_STATUS_OPTIONS) - hier bewusst als eigene, kleine Kopie statt geteiltem
// Import, da das interne Sidebar-Kandidatenprofil und die Portal-Ansicht bewusst
// getrennte, unabhängig änderbare Komponenten sind (siehe portal-sidebar.tsx).
const STATUS_LABELS: Record<string, string> = {
  inbox: "Unbearbeitet",
  vq: "Vorqualifiziert",
  vqk: "Vorqualifiziert beim Kunden",
  vg: "Vorstellungsgespräch",
  ja: "Ja",
  nein: "Nein",
}

export default async function PortalCandidatesPage() {
  const supabase = await createSupabaseServerClient()

  // RLS filtert automatisch auf die eigenen, aktiven Zuordnungen (siehe
  // "Kunde sieht eigene Zuordnungen (nur lesend)" in
  // 20260907000001_client_portal_rls_foundation.sql) - kein zusätzliches .eq() auf
  // client_id nötig oder möglich (der Client kennt seine eigene client_id serverseitig
  // ja nicht direkt in dieser Query, das übernimmt die Policy).
  const { data: assignments } = await supabase
    .from("client_assignments")
    .select("id, status, candidates(id, first_name, last_name, berufsbild, plz)")
    .order("created_at", { ascending: false })

  const rows = (assignments ?? []).filter((a) => a.candidates)

  return (
    <div className="p-6">
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
            <Link
              key={a.id}
              href={`/portal/candidates/${c.id}`}
              className="flex items-center justify-between rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow"
              style={{ borderColor: "#dde3ea" }}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {c.first_name} {c.last_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {[c.berufsbild, c.plz].filter(Boolean).join(" · ") || "—"}
                </p>
              </div>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}
              >
                {STATUS_LABELS[a.status] ?? a.status}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
