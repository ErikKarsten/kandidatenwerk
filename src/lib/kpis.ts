import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

const BERLIN_TZ = "Europe/Berlin"
const NEW_STATUS = "neu"

function getPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  return Number(parts.find((p) => p.type === type)?.value)
}

// Ermittelt den UTC-Zeitpunkt von "heute 00:00 Uhr" in der Zeitzone Europe/Berlin -
// wichtig für "Neue Eingänge heute", da Postgres created_at in UTC speichert und eine
// reine UTC-Mitternacht (z.B. erst 2 Uhr morgens deutscher Sommerzeit) sonst den
// "heutigen" Tag falsch abgrenzen würde. Funktioniert unabhängig von Sommer-/
// Winterzeit, da der Offset jeweils frisch für das aktuelle Datum ermittelt wird -
// keine zusätzliche Zeitzonen-Bibliothek nötig, nur Intl.DateTimeFormat.
function getStartOfTodayBerlin(): Date {
  const now = new Date()

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now)
  const year = getPart(dateParts, "year")
  const month = getPart(dateParts, "month")
  const day = getPart(dateParts, "day")

  // Naive Annahme: Mitternacht dieses Datums als UTC-Zeitpunkt - davon ausgehend wird
  // unten der tatsächliche Berlin-Offset für genau dieses Datum ermittelt.
  const naiveUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0)

  const offsetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(naiveUtcMs))
  let hourAtNaiveUtc = getPart(offsetParts, "hour")
  if (hourAtNaiveUtc === 24) hourAtNaiveUtc = 0
  const minuteAtNaiveUtc = getPart(offsetParts, "minute")
  const offsetMs = (hourAtNaiveUtc * 60 + minuteAtNaiveUtc) * 60 * 1000

  return new Date(naiveUtcMs - offsetMs)
}

// Kampagnen-IDs eines Kunden - die "ursprüngliche Bewerbung"-Verknüpfung zwischen
// Kandidat und Kunde (candidates.campaign_id -> campaigns.client_id). Zweistufig statt
// eines PostgREST-Join-Filters, damit die KPI-Funktionen unten einfache .in()-Filter
// bleiben und nicht auf die embedded-resource-Filtersyntax angewiesen sind.
async function getCampaignIdsForClient(supabase: Supabase, clientId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("id")
    .eq("client_id", clientId)

  if (error) throw new Error(error.message)
  return (data ?? []).map((c) => c.id)
}

// Anzahl Kandidaten, die heute (Berlin-Zeit) angelegt wurden. clientId filtert über
// die Kampagnen dieses Kunden (candidates.campaign_id).
export async function getNewCandidatesTodayCount(
  supabase: Supabase,
  clientId?: string
): Promise<number> {
  let query = supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .gte("created_at", getStartOfTodayBerlin().toISOString())

  if (clientId) {
    const campaignIds = await getCampaignIdsForClient(supabase, clientId)
    if (campaignIds.length === 0) return 0
    query = query.in("campaign_id", campaignIds)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

// Anzahl eindeutiger Kandidaten mit mindestens einem client_assignments-Eintrag (egal
// ob aktiv oder bereits entfernt) - ein Kandidat mit mehreren Zuordnungen zählt nur
// einmal. clientId filtert direkt auf client_assignments.client_id.
export async function getForwardedCount(supabase: Supabase, clientId?: string): Promise<number> {
  let query = supabase.from("client_assignments").select("candidate_id")
  if (clientId) query = query.eq("client_id", clientId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return new Set((data ?? []).map((row) => row.candidate_id)).size
}

// Anzahl Kandidaten mit einem Status ungleich "neu" (unbearbeiteter Status). clientId
// filtert wie bei getNewCandidatesTodayCount über die Kampagnen dieses Kunden.
export async function getProcessedCount(supabase: Supabase, clientId?: string): Promise<number> {
  let query = supabase
    .from("candidates")
    .select("id", { count: "exact", head: true })
    .neq("status", NEW_STATUS)

  if (clientId) {
    const campaignIds = await getCampaignIdsForClient(supabase, clientId)
    if (campaignIds.length === 0) return 0
    query = query.in("campaign_id", campaignIds)
  }

  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

export interface DashboardKpis {
  newToday: number
  forwarded: number
  processed: number
}

// Bündelt alle drei Kennzahlen in einem Aufruf (parallel) - für Dashboard und
// Kunden-Detailseite gleichermaßen nutzbar, optional per clientId gefiltert.
export async function getDashboardKpis(supabase: Supabase, clientId?: string): Promise<DashboardKpis> {
  const [newToday, forwarded, processed] = await Promise.all([
    getNewCandidatesTodayCount(supabase, clientId),
    getForwardedCount(supabase, clientId),
    getProcessedCount(supabase, clientId),
  ])
  return { newToday, forwarded, processed }
}
