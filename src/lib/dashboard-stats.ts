import type { SupabaseClient } from "@supabase/supabase-js"

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

// Zeitraum-Knöpfe für Dashboard und Meta-Analyse-Tool.
export function datePresets(): { label: string; range: DateRange }[] {
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
      .eq("is_demo", false)
      .not("tags", "cs", "{Musterdatensatz}")
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

// Qualifizierte Meta-Leads im Zeitraum (Paket 28, T-116): Kandidaten aus Meta, die im
// Zeitraum eingegangen sind, zu einer der ausgewerteten Meta-Kampagnen gehören und
// vorqualifiziert sind oder schon einer Kanzlei zugeordnet wurden (Zuordnung setzt
// Vorqualifizierung voraus, der Status kann danach weitergewandert sein).
export async function countQualifiedMetaLeads(supabase: SupabaseClient, range: DateRange, campaignIds: string[]): Promise<number> {
  if (campaignIds.length === 0) return 0
  const candidates: { id: string; status: string | null }[] = []
  for (let i = 0; i < campaignIds.length; i += 80) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase
        .from("candidates")
        .select("id, status")
        .eq("source", "meta_ads")
        .eq("is_demo", false)
        .in("campaign_id", campaignIds.slice(i, i + 80))
        .gte("created_at", berlinDayStartUtc(range.from))
        .lt("created_at", berlinDayStartUtc(addDays(range.to, 1)))
        .range(offset, offset + 999)
      if (error) throw new Error(error.message)
      candidates.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
  }
  const qualified = new Set(candidates.filter((c) => c.status === "vorqualifiziert").map((c) => c.id))
  const rest = candidates.filter((c) => !qualified.has(c.id)).map((c) => c.id)
  for (let i = 0; i < rest.length; i += 80) {
    const { data, error } = await supabase.from("client_assignments").select("candidate_id").in("candidate_id", rest.slice(i, i + 80))
    if (error) throw new Error(error.message)
    for (const a of data ?? []) qualified.add(a.candidate_id as string)
  }
  return qualified.size
}
