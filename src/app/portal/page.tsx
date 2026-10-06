import Link from "next/link"
import { Users, Megaphone, Award, Mail, Phone } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { signedAvatarUrl } from "@/lib/team-avatar"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { ASSIGNMENT_STATUS_OPTIONS } from "@/lib/assignment-status"
import { isPortalVisible } from "@/lib/portal-visibility"

// Kandidaten nach Status = Status der Zuordnung beim Kunden (Paket 15, T-71) - dieselben
// Namen wie im Backend und in der Kandidatenliste (src/lib/assignment-status.ts).
const STATUS_COLORS: Record<string, string> = { inbox: "#4ba3c3", vg: "#1e56a0", ja: "#1a9a6a", nein: "#9ca3af" }

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
      .select("status, candidates(status, is_demo)")
      .is("removed_at", null),
    supabase
      .from("campaigns")
      .select("id, status")
      .neq("status", "Archiviert"),
  ])

  const statuses = (assignments ?? [])
    .filter((a) => isPortalVisible(Array.isArray(a.candidates) ? a.candidates[0] : a.candidates))
    .map((a) => a.status)
  const contact = await loadAccountManager(supabase)

  const totalCandidates = statuses.length
  const placedCount = statuses.filter((s) => s === "ja").length
  const activeCampaigns = (campaigns ?? []).length

  const groupCounts = ASSIGNMENT_STATUS_OPTIONS.map((o) => ({
    label: o.label,
    color: STATUS_COLORS[o.value],
    count: statuses.filter((s) => s === o.value).length,
  }))
  const maxGroupCount = Math.max(1, ...groupCounts.map((g) => g.count))

  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Übersicht über Ihre Kandidat:innen und Kampagnen</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <KpiCard icon={Users} label="Kandidaten insgesamt" value={totalCandidates} href="/portal/candidates" iconColor="#4ba3c3" />
        <KpiCard icon={Megaphone} label="Laufende Kampagnen" value={activeCampaigns} href="/portal/campaigns" iconColor="#1e56a0" />
        <KpiCard icon={Award} label="Eingestellt" value={placedCount} iconColor="#1a9a6a" />
      </div>

      <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Kandidaten nach Status</h2>

        {totalCandidates === 0 ? (
          <p className="text-sm text-gray-400">Aktuell sind Ihnen noch keine Kandidaten zugeordnet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {groupCounts.map((g) => (
              <div key={g.label} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-gray-600 sm:w-44">{g.label}</span>
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

      {contact && (
        <div className="mt-4 rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Ihr Ansprechpartner</h2>
          <div className="flex flex-wrap items-center gap-4">
            {contact.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={contact.avatarUrl} alt={contact.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-lg font-semibold" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                {contact.name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-base font-semibold text-gray-900">{contact.name}</p>
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: "#1e56a0" }}>
                  <Mail size={14} /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 text-sm hover:underline" style={{ color: "#1e56a0" }}>
                  <Phone size={14} /> {contact.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        <Link href="/portal/candidates" className="hover:underline" style={{ color: "#1e56a0" }}>
          Alle Kandidaten ansehen →
        </Link>
      </p>
    </div>
  )
}

// Key Account Manager des eigenen Kunden (Paket 15, T-73). Portal-Kunden dürfen fremde
// Profile per RLS nicht lesen - deshalb per Service-Role, aber nur für den KAM des
// eigenen, serverseitig aus der Session ermittelten Kunden und nur Kontaktfelder.
async function loadAccountManager(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ name: string; email: string | null; phone: string | null; avatarUrl: string | null } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: own } = await supabase.from("profiles").select("client_id").eq("id", user.id).single()
  if (!own?.client_id) return null
  const admin = createSupabaseAdminClient()
  const { data: client } = await admin.from("clients").select("key_account_manager_id").eq("id", own.client_id).single()
  if (!client?.key_account_manager_id) return null
  const { data: kam } = await admin
    .from("profiles")
    .select("full_name, email, phone, avatar_path, role")
    .eq("id", client.key_account_manager_id)
    .maybeSingle()
  if (!kam || !["agency_admin", "agency_member"].includes(kam.role)) return null
  return {
    name: kam.full_name ?? "Ihr Team",
    email: kam.email,
    phone: kam.phone,
    avatarUrl: await signedAvatarUrl(admin, kam.avatar_path),
  }
}
