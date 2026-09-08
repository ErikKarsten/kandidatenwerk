import { createSupabaseServerClient } from "@/lib/supabase-server"

// Gleiche Label-Konvention wie portal/page.tsx (STATUS_LABELS) und
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
  // bei portal/page.tsx (client_assignments). candidates(count) respektiert dabei die
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

      <div className="flex flex-col gap-2">
        {rows.map((c) => {
          const s = STATUS_LABEL[c.status] ?? STATUS_LABEL.completed
          return (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border bg-white p-4"
              style={{ borderColor: "#dde3ea" }}
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{c.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.leadsCount} Kandidat{c.leadsCount !== 1 ? "en" : ""}
                </p>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: s.bg, color: s.text }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
