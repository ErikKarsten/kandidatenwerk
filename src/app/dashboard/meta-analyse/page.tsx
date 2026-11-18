import Link from "@/components/app-link"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { countQualifiedMetaLeads, datePresets, parseDateRange } from "@/lib/dashboard-stats"
import { loadMetaAnalyse } from "@/lib/meta-analyse-server"
import { AnalyseView } from "./analyse-view"

const longDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" })

// Meta-Analyse-Tool (Paket 108): die Kampagnenanalyse aus dem eigenständigen
// Meta-Analyse-Tool, jetzt in Kandidatenwerk. Alle Zahlen kommen aus der Datenbank
// (zentraler Meta-Abruf alle 30 Minuten, Texte/Bilder täglich) - beim Öffnen keine
// Meta-Anfrage.
export default async function MetaAnalysePage({ searchParams }: { searchParams: Promise<{ von?: string; bis?: string }> }) {
  const sp = await searchParams
  const range = parseDateRange(sp.von, sp.bis)
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) redirect("/login")

  const daten = await loadMetaAnalyse(range)
  // Qualifizierte Leads (vorher auf dem Dashboard, Paket 28): Kandidaten aus den
  // ausgewerteten Meta-Kampagnen, die vorqualifiziert sind oder zugeordnet wurden.
  const { data: leadCampaigns } = daten.metaKampagnenIds.length
    ? await supabase.from("campaigns").select("id, meta_campaign_id").eq("kind", "lead").in("meta_campaign_id", daten.metaKampagnenIds)
    : { data: [] as { id: string; meta_campaign_id: string | null }[] }
  const qualifiziert = await countQualifiedMetaLeads(supabase, range, (leadCampaigns ?? []).map((c) => c.id))
  // Kosten pro qualifiziertem Lead nur über die Kampagnen, deren Leads in Kandidatenwerk landen.
  const inKandidatenwerk = new Set((leadCampaigns ?? []).map((c) => c.meta_campaign_id))
  const qualifiziertAusgaben = daten.anzeigen.filter((a) => a.kampagne_id && inKandidatenwerk.has(a.kampagne_id)).reduce((s, a) => s + a.ausgaben, 0)
  const activePreset = datePresets().find((p) => p.range.from === range.from && p.range.to === range.to)?.label

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meta-Analyse-Tool</h1>
          <p className="mt-1 text-sm text-gray-500">
            Zeitraum {longDate(range.from)} bis {longDate(range.to)}
            {daten.stand &&
              ` · Stand ${new Date(daten.stand).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} Uhr`}
            {daten.datenAb && range.from < daten.datenAb ? ` · Zahlen gespeichert ab ${longDate(daten.datenAb)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {datePresets().map((p) => (
            <Link
              key={p.label}
              href={`/dashboard/meta-analyse?von=${p.range.from}&bis=${p.range.to}`}
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
          <form method="get" action="/dashboard/meta-analyse" className="flex flex-wrap items-center gap-1.5">
            <input type="date" name="von" defaultValue={range.from} className="rounded-md border bg-white px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }} />
            <span className="text-xs text-gray-400">bis</span>
            <input type="date" name="bis" defaultValue={range.to} className="rounded-md border bg-white px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }} />
            <button type="submit" className="rounded-md px-2.5 py-1 text-xs font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
              Anzeigen
            </button>
          </form>
        </div>
      </div>

      <AnalyseView anzeigen={daten.anzeigen} qualifiziert={qualifiziert} qualifiziertAusgaben={qualifiziertAusgaben} />
    </div>
  )
}
