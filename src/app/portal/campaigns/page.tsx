import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Gleiche Label-Konvention wie portal/candidates/page.tsx (STATUS_LABELS) und
// clients/[id]/client-detail.tsx (CAMPAIGN_STATUS) - bewusst eigene Kopie, siehe
// Begründung dort. "Archiviert" taucht hier bewusst nicht auf: archivierte Kampagnen
// werden unten herausgefiltert, sind für den Kunden nicht "aktuell laufend".
const STATUS_LABEL: Record<string, { label: string; bg: string; dot: string; text: string }> = {
  active: { label: "Aktiv", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { label: "Pausiert", bg: "#f5990018", dot: "#f59900", text: "#d97706" },
  completed: { label: "Abgeschlossen", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

export default async function PortalCampaignsPage() {
  const supabase = await createSupabaseServerClient()

  // RLS ("Kunde sieht Kampagnen des eigenen Kunden", siehe
  // 20260908000003_client_portal_campaigns_read.sql) filtert automatisch auf die
  // eigene client_id - kein zusätzliches .eq() nötig oder möglich, gleiches Muster wie
  // bei portal/candidates/page.tsx (client_assignments). candidates(count) respektiert dabei die
  // bestehende candidates-RLS (nur aktiv zugeordnete Kandidaten zählen mit).
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, status, candidates(count)")
    .neq("status", "Archiviert")
    .order("created_at", { ascending: false })

  const rows = (campaigns ?? []).map((c) => {
    const countRow = Array.isArray(c.candidates) ? c.candidates[0] : null
    const leadsCount = countRow ? Number((countRow as { count: number | string }).count) : 0
    return { id: c.id, title: c.title, status: c.status, leadsCount }
  })

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Meine Kampagnen</h1>
      <p className="text-sm text-gray-500 mb-6">
        {rows.length} aktuell laufende Kampagne{rows.length !== 1 ? "n" : ""}
      </p>

      {rows.length === 0 && (
        <p className="text-sm text-gray-400">Aktuell laufen keine Kampagnen für Sie.</p>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {rows.map((c) => {
          const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.completed
          return (
            <Link
              key={c.id}
              href={`/portal/campaigns/${c.id}`}
              className="flex flex-col gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
              style={{ borderColor: "#dde3ea" }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium leading-snug text-gray-900">{c.title}</h3>
                <span
                  className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: s.bg, color: s.text }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                  {s.label}
                </span>
              </div>
              <span className="text-xs font-medium" style={{ color: "#1e56a0" }}>
                {c.leadsCount} Kandidat{c.leadsCount !== 1 ? "en" : ""}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
