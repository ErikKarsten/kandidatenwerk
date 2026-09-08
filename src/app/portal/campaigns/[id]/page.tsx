import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Gleiche Label-Konventionen wie an den anderen Portal-Stellen (bewusst eigene Kopien,
// siehe portal-sidebar.tsx / portal/candidates/page.tsx / portal/campaigns/page.tsx).
const CAMPAIGN_STATUS_LABEL: Record<string, { label: string; bg: string; dot: string; text: string }> = {
  active: { label: "Aktiv", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { label: "Pausiert", bg: "#f5990018", dot: "#f59900", text: "#d97706" },
  completed: { label: "Abgeschlossen", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}
const ASSIGNMENT_STATUS_LABEL: Record<string, string> = {
  inbox: "Unbearbeitet",
  vq: "Vorqualifiziert",
  vqk: "Vorqualifiziert beim Kunden",
  vg: "Vorstellungsgespräch",
  ja: "Ja",
  nein: "Nein",
}

export default async function PortalCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  // RLS ("Kunde sieht Kampagnen des eigenen Kunden") liefert hier automatisch nur etwas
  // zurück, wenn die Kampagne auch wirklich dem eigenen Kunden gehört - sonst kommt
  // einfach null zurück, kein Fehler (gleiches Prinzip wie bei
  // portal/candidates/[id]/page.tsx).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, title, status")
    .eq("id", id)
    .single()

  if (!campaign) notFound()

  // Gleiches Muster wie portal/candidates/page.tsx: alle eigenen Zuordnungen holen
  // (RLS scoped bereits auf den eigenen Kunden) und hier zusätzlich clientseitig auf
  // diese Kampagne filtern - vermeidet eine cross-table-Filterung auf einer
  // eingebetteten Relation (candidates.campaign_id), die in Supabase-JS einen
  // Inner-Join-Hint bräuchte und nirgends sonst im Code verwendet wird.
  const { data: assignments } = await supabase
    .from("client_assignments")
    .select("id, status, candidates(id, first_name, last_name, berufsbild, plz, campaign_id)")
    .is("removed_at", null)
    .order("created_at", { ascending: false })

  const rows = (assignments ?? [])
    .map((a) => ({ ...a, candidates: Array.isArray(a.candidates) ? a.candidates[0] : a.candidates }))
    .filter((a) => a.candidates?.campaign_id === id)

  const s = CAMPAIGN_STATUS_LABEL[campaign.status] ?? CAMPAIGN_STATUS_LABEL.completed

  return (
    <div className="p-6 max-w-3xl">
      <Link href="/portal/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} />
        Zurück zu meinen Kampagnen
      </Link>

      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-xl font-bold text-gray-900">{campaign.title}</h1>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: s.bg, color: s.text }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
          {s.label}
        </span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {rows.length} Kandidat{rows.length !== 1 ? "en" : ""} in dieser Kampagne
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Noch keine Kandidaten in dieser Kampagne.
        </div>
      ) : (
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
                  {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
