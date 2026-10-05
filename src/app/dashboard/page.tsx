import Link from "next/link"
import { Users, Megaphone, UserSearch, UserX, Inbox, Euro, Target, Coins } from "lucide-react"
import { KpiCard } from "@/components/dashboard/kpi-card"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import {
  addDays,
  berlinToday,
  getApplicationStats,
  getMetaAdStats,
  parseDateRange,
  SOURCE_LABELS,
  type DateRange,
} from "@/lib/dashboard-stats"

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })
const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

function presets(): { label: string; range: DateRange }[] {
  const today = berlinToday()
  const monthStart = `${today.slice(0, 7)}-01`
  const lastMonthEnd = addDays(monthStart, -1)
  return [
    { label: "Heute", range: { from: today, to: today } },
    { label: "Gestern", range: { from: addDays(today, -1), to: addDays(today, -1) } },
    { label: "7 Tage", range: { from: addDays(today, -6), to: today } },
    { label: "30 Tage", range: { from: addDays(today, -29), to: today } },
    { label: "Dieser Monat", range: { from: monthStart, to: today } },
    { label: "Letzter Monat", range: { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd } },
  ]
}

// Dashboard (02.10.2026 neu gedacht): oben der aktuelle Bestand, darunter die
// Auswertung eines frei wählbaren Zeitraums - eingegangene Bewerbungen sowie
// Werbeausgaben und Kosten pro Lead aus dem Meta-Werbekonto.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const sp = await searchParams
  const range = parseDateRange(sp.von, sp.bis)
  const supabase = await createSupabaseServerClient()

  const [
    { count: clientCount },
    { count: runningCampaignCount },
    { count: candidateCount },
    assignedCount,
    applications,
    ads,
    { data: leadCampaigns },
    { data: onboardingRows },
    { data: teamRows },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("campaigns").select("*", { count: "exact", head: true }).eq("kind", "lead").eq("status", "active"),
    supabase.from("candidates").select("*", { count: "exact", head: true }).eq("is_demo", false),
    countAssignedCandidates(supabase),
    getApplicationStats(supabase, range),
    getMetaAdStats(range),
    supabase.from("campaigns").select("id, meta_campaign_id").eq("kind", "lead").not("meta_campaign_id", "is", null),
    // Onboarding offen (Paket 13): Kunden in Phase Onboarding ohne abgeschlossenes Kanzleiprofil.
    supabase
      .from("clients")
      .select("id, name, created_at, key_account_manager_id, client_profiles(finalized_at)")
      .eq("project_phase", "onboarding")
      .neq("status", "Archiviert")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").in("role", ["agency_admin", "agency_member"]),
  ])

  const unassigned = Math.max(0, (candidateCount ?? 0) - assignedCount)
  const onboardingOpen = (onboardingRows ?? []).filter((c) => {
    const profile = Array.isArray(c.client_profiles) ? c.client_profiles[0] : c.client_profiles
    return !profile?.finalized_at
  })
  const kamName = (id: string | null) => (teamRows ?? []).find((t) => t.id === id)?.full_name ?? null
  const campaignIdByMetaId = new Map((leadCampaigns ?? []).map((c) => [c.meta_campaign_id as string, c.id as string]))
  const costPerLead = ads.ok && ads.leads > 0 ? ads.spend / ads.leads : null
  const maxPerDay = Math.max(1, ...applications.byDay.map((d) => d.count))
  const activePreset = presets().find((p) => p.range.from === range.from && p.range.to === range.to)?.label

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Aktueller Bestand und Auswertung nach Zeitraum</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Users} label="Aktive Kunden" value={clientCount ?? 0} iconColor="#1e56a0" href="/dashboard/clients" />
        <KpiCard icon={Megaphone} label="Laufende Meta-Kampagnen" value={runningCampaignCount ?? 0} iconColor="#4ba3c3" href="/dashboard/einstellungen" />
        <KpiCard icon={UserSearch} label="Kandidaten" value={candidateCount ?? 0} iconColor="#8b5cf6" href="/dashboard/candidates" />
        <KpiCard icon={UserX} label="Noch keiner Kanzlei zugeordnet" value={unassigned} iconColor="#f59e0b" href="/dashboard/candidates" />
      </div>

      {onboardingOpen.length > 0 && (
        <section className="rounded-xl border bg-white p-5" style={{ borderColor: "#f59e0b66" }}>
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Onboarding offen ({onboardingOpen.length})</h2>
          <p className="mb-3 text-xs text-gray-500">Kunden in der Phase Onboarding, deren Kanzleiprofil noch nicht abgeschlossen ist.</p>
          <ul className="flex flex-col divide-y" style={{ borderColor: "#eef2f6" }}>
            {onboardingOpen.slice(0, 8).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/dashboard/clients/${c.id}?tab=projekt`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                  {c.name}
                </Link>
                <span className="text-xs text-gray-500">
                  {kamName(c.key_account_manager_id) ? `KAM: ${kamName(c.key_account_manager_id)}` : "Kein KAM"} · seit{" "}
                  {new Date(c.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
                </span>
              </li>
            ))}
          </ul>
          {onboardingOpen.length > 8 && (
            <Link href="/dashboard/clients?phase=onboarding" className="mt-2 inline-block text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
              Alle {onboardingOpen.length} anzeigen
            </Link>
          )}
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Auswertung</h2>
            <p className="text-sm text-gray-500">
              {longDate(range.from)} – {longDate(range.to)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {presets().map((p) => (
              <Link
                key={p.label}
                href={`/dashboard?von=${p.range.from}&bis=${p.range.to}`}
                className="rounded-md border px-2.5 py-1 text-xs font-medium"
                style={
                  activePreset === p.label
                    ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "#fff" }
                    : { backgroundColor: "#fff", borderColor: "#dde3ea", color: "#374151" }
                }
              >
                {p.label}
              </Link>
            ))}
            <form method="get" action="/dashboard" className="flex flex-wrap items-center gap-1.5">
              <input type="date" name="von" defaultValue={range.from} className="rounded-md border bg-white px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }} />
              <span className="text-xs text-gray-400">bis</span>
              <input type="date" name="bis" defaultValue={range.to} className="rounded-md border bg-white px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }} />
              <button type="submit" className="rounded-md px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
                Anzeigen
              </button>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard icon={Inbox} label="Eingegangene Bewerbungen" value={applications.total} iconColor="#4ba3c3" />
          <KpiCard icon={Euro} label="Werbeausgaben (Meta)" value={ads.ok ? eur.format(ads.spend) : "–"} iconColor="#1e56a0" />
          <KpiCard icon={Target} label="Leads laut Meta" value={ads.ok ? ads.leads : "–"} iconColor="#8b5cf6" />
          <KpiCard icon={Coins} label="Ø Kosten pro Lead" value={costPerLead !== null ? eur.format(costPerLead) : "–"} iconColor="#1a9a6a" />
        </div>
        {!ads.ok && <p className="text-xs text-amber-700">{ads.error}</p>}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-xl border bg-white p-5 xl:col-span-2" style={{ borderColor: "#dde3ea" }}>
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Bewerbungen pro Tag</h3>
            <div className="flex h-40 items-end gap-0.5">
              {applications.byDay.map((d) => (
                <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end" title={`${shortDate(d.date)}: ${d.count}`}>
                  <div className="rounded-t-sm" style={{ height: `${(d.count / maxPerDay) * 100}%`, minHeight: d.count > 0 ? 2 : 0, backgroundColor: "#4ba3c3" }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-gray-400">
              <span>{shortDate(range.from)}</span>
              <span>{shortDate(range.to)}</span>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Bewerbungen nach Herkunft</h3>
            {applications.bySource.length === 0 ? (
              <p className="text-sm text-gray-400">Keine Bewerbungen im Zeitraum.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {applications.bySource.map((s) => (
                  <li key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{SOURCE_LABELS[s.source] ?? s.source}</span>
                    <span className="font-medium text-gray-900">{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {ads.ok && ads.campaigns.length > 0 && (
          <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Meta-Kampagnen im Zeitraum (nach Ausgaben)</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                    <th className="py-2 pr-3 font-medium">Kampagne</th>
                    <th className="py-2 pr-3 text-right font-medium">Ausgaben</th>
                    <th className="py-2 pr-3 text-right font-medium">Leads</th>
                    <th className="py-2 text-right font-medium">Kosten pro Lead</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.campaigns.slice(0, 15).map((c) => {
                    const ownId = campaignIdByMetaId.get(c.metaCampaignId)
                    return (
                      <tr key={c.metaCampaignId} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                        <td className="py-2 pr-3">
                          {ownId ? (
                            <Link href={`/dashboard/campaigns/${ownId}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                              {c.name}
                            </Link>
                          ) : (
                            c.name
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right text-gray-700">{eur.format(c.spend)}</td>
                        <td className="py-2 pr-3 text-right text-gray-700">{c.leads}</td>
                        <td className="py-2 text-right text-gray-700">{c.leads > 0 ? eur.format(c.spend / c.leads) : "–"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {ads.campaigns.length > 15 && <p className="mt-2 text-xs text-gray-400">+ {ads.campaigns.length - 15} weitere Kampagnen mit kleineren Ausgaben</p>}
          </div>
        )}
      </section>
    </div>
  )
}

// Anzahl verschiedener Kandidaten mit mindestens einer aktiven Kanzlei-Zuordnung.
async function countAssignedCandidates(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<number> {
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("client_assignments").select("candidate_id, candidates!inner(is_demo)").is("removed_at", null).eq("candidates.is_demo", false).range(from, from + 999)
    for (const r of data ?? []) ids.add(r.candidate_id)
    if (!data || data.length < 1000) break
  }
  return ids.size
}
