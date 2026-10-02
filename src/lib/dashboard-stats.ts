import type { SupabaseClient } from "@supabase/supabase-js"
import { metaGraphFetch } from "@/lib/meta-ads-client"

// Auswertung nach Zeitraum für das Dashboard: eingegangene Bewerbungen (Kandidatenwerk)
// sowie Werbeausgaben und Leads laut Meta-Werbekonto (Insights-API, 1-2 Aufrufe je
// Seitenaufruf). Das Werbekonto rechnet in Europe/Berlin und EUR (geprüft 02.10.2026).

export const TIME_ZONE = "Europe/Berlin"

export interface DateRange {
  from: string // YYYY-MM-DD, inklusive
  to: string // YYYY-MM-DD, inklusive
}

export function berlinToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date())
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Beginn eines Berliner Kalendertags als UTC-ISO-Zeitpunkt (Sommer-/Winterzeit-sicher).
export function berlinDayStartUtc(date: string): string {
  const noonUtc = new Date(`${date}T12:00:00Z`)
  const berlinNoon = new Date(noonUtc.toLocaleString("en-US", { timeZone: TIME_ZONE }))
  const utcNoon = new Date(noonUtc.toLocaleString("en-US", { timeZone: "UTC" }))
  const offsetMs = berlinNoon.getTime() - utcNoon.getTime()
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - offsetMs).toISOString()
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseDateRange(from: string | undefined, to: string | undefined): DateRange {
  const today = berlinToday()
  const validTo = to && DATE_RE.test(to) ? to : today
  const validFrom = from && DATE_RE.test(from) ? from : addDays(validTo, -29)
  return validFrom <= validTo ? { from: validFrom, to: validTo } : { from: validTo, to: validFrom }
}

export const SOURCE_LABELS: Record<string, string> = {
  meta_ads: "Meta",
  leadtable: "Leadtable",
  kanzleistelle24: "Kanzleistelle24.de",
  manual: "Manuell",
}

export interface ApplicationStats {
  total: number
  bySource: { source: string; count: number }[]
  byDay: { date: string; count: number }[]
}

export async function getApplicationStats(supabase: SupabaseClient, range: DateRange): Promise<ApplicationStats> {
  const rows: { created_at: string; source: string | null }[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("candidates")
      .select("created_at, source")
      .gte("created_at", berlinDayStartUtc(range.from))
      .lt("created_at", berlinDayStartUtc(addDays(range.to, 1)))
      .order("created_at")
      .range(offset, offset + 999)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }

  const bySource = new Map<string, number>()
  const byDay = new Map<string, number>()
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE })
  for (const r of rows) {
    const source = r.source ?? "manual"
    bySource.set(source, (bySource.get(source) ?? 0) + 1)
    const day = dayFormat.format(new Date(r.created_at))
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }

  const days: { date: string; count: number }[] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push({ date: d, count: byDay.get(d) ?? 0 })

  return {
    total: rows.length,
    bySource: [...bySource].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    byDay: days,
  }
}

export interface MetaCampaignSpend {
  metaCampaignId: string
  name: string
  spend: number
  leads: number
}

export type MetaAdStats =
  | { ok: true; spend: number; leads: number; campaigns: MetaCampaignSpend[] }
  | { ok: false; error: string }

interface InsightsRow {
  campaign_id?: string
  campaign_name?: string
  spend?: string
  actions?: { action_type: string; value: string }[]
}

function leadCount(actions: InsightsRow["actions"]): number {
  return Number(actions?.find((a) => a.action_type === "lead")?.value ?? 0)
}

// Ein Aufruf auf Kampagnenebene reicht - die Summe ergibt die Kontowerte.
export async function getMetaAdStats(range: DateRange): Promise<MetaAdStats> {
  const accountId = process.env.META_AD_ACCOUNT_ID
  if (!accountId || !process.env.META_ACCESS_TOKEN) return { ok: false, error: "Meta-Werbekonto ist nicht eingerichtet." }

  try {
    const rows: InsightsRow[] = []
    let after: string | undefined
    for (let page = 0; page < 10; page++) {
      const resp = await metaGraphFetch<{ data: InsightsRow[]; paging?: { cursors?: { after?: string }; next?: string } }>(
        `/act_${accountId.replace(/^act_/, "")}/insights`,
        {
          fields: "campaign_id,campaign_name,spend,actions",
          level: "campaign",
          time_range: JSON.stringify({ since: range.from, until: range.to }),
          limit: 200,
          ...(after ? { after } : {}),
        }
      )
      rows.push(...resp.data)
      after = resp.paging?.next ? resp.paging.cursors?.after : undefined
      if (!after) break
    }

    const campaigns = rows
      .map((r) => ({
        metaCampaignId: r.campaign_id ?? "",
        name: r.campaign_name ?? "",
        spend: Number(r.spend ?? 0),
        leads: leadCount(r.actions),
      }))
      .sort((a, b) => b.spend - a.spend)
    return {
      ok: true,
      spend: campaigns.reduce((sum, c) => sum + c.spend, 0),
      leads: campaigns.reduce((sum, c) => sum + c.leads, 0),
      campaigns,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      error: message.includes('"code":17') ? "Meta hat zu viele Anfragen gemeldet – bitte später neu laden." : "Werbedaten von Meta derzeit nicht abrufbar.",
    }
  }
}
