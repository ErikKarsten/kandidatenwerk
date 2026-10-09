import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"
import { LeadCampaignTiles, type LeadCampaignTile } from "./lead-campaign-tiles"

// "Kandidaten nach Kampagnen" (Paket 46): Lead-Kampagnen aus Meta als Kacheln, je Kachel die
// Kandidaten, die über diese Kampagne eingegangen sind. Gezeigt werden laufende KS24-Kampagnen
// und alle Kampagnen mit mindestens einem Kandidaten.
// "Heute, 10:14" / "Gestern, 21:27" / "07.10.26, 15:51" (Zeitzone Berlin).
function formatWhen(iso: string, now: number): string {
  const tz = "Europe/Berlin"
  const d = new Date(iso)
  const day = (x: Date) => x.toLocaleDateString("de-DE", { timeZone: tz })
  const time = d.toLocaleTimeString("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
  if (day(d) === day(new Date(now))) return `Heute, ${time}`
  if (day(d) === day(new Date(now - 86400e3))) return `Gestern, ${time}`
  return `${d.toLocaleDateString("de-DE", { timeZone: tz, day: "2-digit", month: "2-digit", year: "2-digit" })}, ${time}`
}

// Kampagnen mit Kennzahlen laden (außerhalb der Komponente: nutzt die aktuelle Uhrzeit).
async function loadLeadCampaignTiles(): Promise<LeadCampaignTile[]> {
  const supabase = await createSupabaseServerClient()

  const campaigns: { id: string; title: string; status: string; meta_effective_status: string | null; berufsbild: string | null }[] = []
  for (let from = 0; ; from += 1000) {
    // meta_effective_status fehlt in den generierten Typen (wie in meta-campaigns-queries.ts).
    const { data } = await (supabase as unknown as SupabaseClient)
      .from("campaigns")
      .select("id, title, status, meta_effective_status, berufsbild")
      .eq("kind", "lead")
      .range(from, from + 999)
    campaigns.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  // Kennzahlen je Kampagne wie in Leadtable (Paket 47): unbearbeitet = Status "neu",
  // neu = in den letzten 48 Stunden eingegangen, überfällig = unbearbeitet und älter.
  const NEW_MS = 48 * 3600 * 1000
  const now = Date.now()
  type Stats = { total: number; unbearbeitet: number; neu: number; ueberfaellig: number; status: Record<string, number>; last: string | null; changed: string | null }
  const stats = new Map<string, Stats>()
  const campaignOf = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("candidates")
      .select("id, campaign_id, status, created_at")
      .not("campaign_id", "is", null)
      .eq("is_demo", false)
      .range(from, from + 999)
    for (const c of data ?? []) {
      const e = stats.get(c.campaign_id!) ?? { total: 0, unbearbeitet: 0, neu: 0, ueberfaellig: 0, status: {}, last: null, changed: null }
      const recent = now - new Date(c.created_at).getTime() < NEW_MS
      e.total++
      e.status[c.status] = (e.status[c.status] ?? 0) + 1
      if (recent) e.neu++
      if (c.status === "neu") {
        e.unbearbeitet++
        if (!recent) e.ueberfaellig++
      }
      if (!e.last || c.created_at > e.last) e.last = c.created_at
      if (!e.changed || c.created_at > e.changed) e.changed = c.created_at
      stats.set(c.campaign_id!, e)
      campaignOf.set(c.id, c.campaign_id!)
    }
    if (!data || data.length < 1000) break
  }
  // Letzte Änderung: jüngster Verlaufseintrag (Status, Notiz, Mail …) eines Kandidaten.
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("candidate_history").select("candidate_id, created_at").range(from, from + 999)
    for (const h of data ?? []) {
      const campaignId = campaignOf.get(h.candidate_id)
      const e = campaignId ? stats.get(campaignId) : null
      if (e && (!e.changed || h.created_at > e.changed)) e.changed = h.created_at
    }
    if (!data || data.length < 1000) break
  }

  return campaigns
    .map((c) => {
      const e = stats.get(c.id)
      const running = c.meta_effective_status ? c.meta_effective_status === "ACTIVE" : c.status === "active"
      return {
        id: c.id,
        title: c.title,
        running,
        berufsbild: c.berufsbild,
        total: e?.total ?? 0,
        unbearbeitet: e?.unbearbeitet ?? 0,
        neu: e?.neu ?? 0,
        ueberfaellig: e?.ueberfaellig ?? 0,
        statusCounts: e?.status ?? {},
        lastLeadAt: e?.last ?? null,
        lastLeadLabel: e?.last ? formatWhen(e.last, now) : null,
        lastChangeLabel: e?.changed ? formatWhen(e.changed, now) : null,
        ks24: isKs24Campaign(c.title),
      }
    })
    .filter((t) => t.total > 0 || (t.running && t.ks24))
    .sort((a, b) => Number(b.running) - Number(a.running) || (b.lastLeadAt ?? "").localeCompare(a.lastLeadAt ?? "") || a.title.localeCompare(b.title))

}

export default async function LeadCampaignsPage() {
  const tiles = await loadLeadCampaignTiles()
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Kandidaten nach Kampagnen</h1>
        <p className="mt-1 text-sm text-gray-500">Lead-Kampagnen aus Meta mit den Kandidaten, die über sie eingegangen sind.</p>
      </div>
      <LeadCampaignTiles tiles={tiles} />
    </div>
  )
}
