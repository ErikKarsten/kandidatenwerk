import Link from "next/link"
import { Users, Megaphone, Award } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { KpiCard } from "@/components/dashboard/kpi-card"

// Gruppiert die 10 internen candidates.status-Rohwerte (siehe src/lib/candidate-status.ts)
// zu 5 kundenverständlichen Stufen. Bewusst NICHT 1:1 die internen Werte zeigen -
// "in_pruefung", "nicht_erreicht" und "nicht_erreicht_mail" sind reine
// Recruiting-Arbeitsschritte (Erreichbarkeits-Versuche), die für den Kunden nur
// verwirrend/unnötig alarmierend wären ("warum wurde mein Kandidat 2x nicht
// erreicht?"). Sie landen deshalb gemeinsam mit "in_kontakt" in einem einzigen
// "In Kontakt"-Eimer - für den Kunden zählt nur: wir sind dran. "interview" und
// "vorgestellt" werden bewusst zusammengelegt ("Im Vorstellungsprozess"), da beide
// Werte in der Praxis dieselbe Kundennähe signalisieren (Termin läuft/lief) und die
// Leadtable-Herkunft von "interview" vs. die rein manuelle Herkunft von "vorgestellt"
// (siehe leadtable-sync-shared.ts) ein internes Detail ist, keine für den Kunden
// bedeutungsvolle Unterscheidung.
const STATUS_GROUPS: { label: string; values: string[]; color: string }[] = [
  { label: "Neu eingegangen", values: ["neu"], color: "#4ba3c3" },
  { label: "In Kontakt", values: ["in_pruefung", "nicht_erreicht", "nicht_erreicht_mail", "in_kontakt"], color: "#14b8a6" },
  { label: "Vorqualifiziert", values: ["vorqualifiziert"], color: "#0ea5e9" },
  { label: "Im Vorstellungsprozess", values: ["interview", "vorgestellt"], color: "#8b5cf6" },
  { label: "Platziert", values: ["platziert"], color: "#1a9a6a" },
  { label: "Abgelehnt", values: ["abgelehnt"], color: "#9ca3af" },
]

export default async function PortalDashboardPage() {
  const supabase = await createSupabaseServerClient()

  // Gleiches RLS-Prinzip wie ueberall im Portal: beide Queries liefern automatisch nur
  // die eigenen Daten (client_assignments -> "Kunde sieht eigene Zuordnungen", campaigns
  // -> "Kunde sieht Kampagnen des eigenen Kunden", siehe
  // 20260907000001_client_portal_rls_foundation.sql bzw.
  // 20260908000003_client_portal_campaigns_read.sql).
  const [{ data: assignments }, { data: campaigns }] = await Promise.all([
    supabase
      .from("client_assignments")
      .select("candidates(status)")
      .is("removed_at", null),
    supabase
      .from("campaigns")
      .select("id, status")
      .neq("status", "Archiviert"),
  ])

  const statuses = (assignments ?? [])
    .map((a) => (Array.isArray(a.candidates) ? a.candidates[0]?.status : a.candidates?.status))
    .filter((s): s is string => Boolean(s))

  const totalCandidates = statuses.length
  const placedCount = statuses.filter((s) => s === "platziert").length
  const activeCampaigns = (campaigns ?? []).length

  const groupCounts = STATUS_GROUPS.map((g) => ({
    ...g,
    count: statuses.filter((s) => g.values.includes(s)).length,
  }))
  const maxGroupCount = Math.max(1, ...groupCounts.map((g) => g.count))

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Übersicht über Ihre Kandidat:innen und Kampagnen</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <KpiCard icon={Users} label="Kandidaten insgesamt" value={totalCandidates} href="/portal/candidates" iconColor="#4ba3c3" />
        <KpiCard icon={Megaphone} label="Laufende Kampagnen" value={activeCampaigns} href="/portal/campaigns" iconColor="#1e56a0" />
        <KpiCard icon={Award} label="Platziert" value={placedCount} iconColor="#1a9a6a" />
      </div>

      <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Kandidaten nach Status</h2>

        {totalCandidates === 0 ? (
          <p className="text-sm text-gray-400">Aktuell sind Ihnen noch keine Kandidaten zugeordnet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groupCounts.map((g) => (
              <div key={g.label} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm text-gray-600">{g.label}</span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(g.count / maxGroupCount) * 100}%`,
                      backgroundColor: g.color,
                    }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-sm font-medium text-gray-900">{g.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-gray-400">
        <Link href="/portal/candidates" className="hover:underline" style={{ color: "#1e56a0" }}>
          Alle Kandidaten ansehen →
        </Link>
      </p>
    </div>
  )
}
