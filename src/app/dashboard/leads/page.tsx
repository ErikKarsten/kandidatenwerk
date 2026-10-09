import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"
import { LeadCampaignTiles, type LeadCampaignTile } from "./lead-campaign-tiles"

// "Kandidaten nach Kampagnen" (Paket 46): Lead-Kampagnen aus Meta als Kacheln, je Kachel die
// Kandidaten, die über diese Kampagne eingegangen sind. Gezeigt werden laufende KS24-Kampagnen
// und alle Kampagnen mit mindestens einem Kandidaten.
export default async function LeadCampaignsPage() {
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

  const counts = new Map<string, { total: number; neu: number; vorqualifiziert: number; last: string | null }>()
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase
      .from("candidates")
      .select("campaign_id, status, created_at")
      .not("campaign_id", "is", null)
      .eq("is_demo", false)
      .range(from, from + 999)
    for (const c of data ?? []) {
      const e = counts.get(c.campaign_id!) ?? { total: 0, neu: 0, vorqualifiziert: 0, last: null }
      e.total++
      if (c.status === "neu") e.neu++
      if (c.status === "vorqualifiziert") e.vorqualifiziert++
      if (!e.last || c.created_at > e.last) e.last = c.created_at
      counts.set(c.campaign_id!, e)
    }
    if (!data || data.length < 1000) break
  }

  const tiles: LeadCampaignTile[] = campaigns
    .map((c) => {
      const e = counts.get(c.id)
      const running = c.meta_effective_status ? c.meta_effective_status === "ACTIVE" : c.status === "active"
      return { id: c.id, title: c.title, running, berufsbild: c.berufsbild, total: e?.total ?? 0, neu: e?.neu ?? 0, vorqualifiziert: e?.vorqualifiziert ?? 0, lastLeadAt: e?.last ?? null, ks24: isKs24Campaign(c.title) }
    })
    .filter((t) => t.total > 0 || (t.running && t.ks24))
    .sort((a, b) => Number(b.running) - Number(a.running) || (b.lastLeadAt ?? "").localeCompare(a.lastLeadAt ?? "") || a.title.localeCompare(b.title))

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
