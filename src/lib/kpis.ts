import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

// database.ts kennt "count_distinct_forwarded_candidates" erst, nachdem die Migration
// (20260909000003_forwarded_count_function.sql) gelaufen ist und scripts/gen-types.mjs
// neu generiert wurde (Functions: Record<string, never> bis dahin) - deshalb hier ein
// eng gefasster Cast statt eines pauschalen `any`, der Aufruf selbst bleibt typsicher.
type SupabaseWithForwardedCountRpc = Supabase & {
  rpc(
    fn: "count_distinct_forwarded_candidates",
    args: { p_client_id: string | null }
  ): PromiseLike<{ data: number | null; error: { message: string } | null }>
}

// Anzahl eindeutiger Kandidaten mit mindestens einem client_assignments-Eintrag (egal
// ob aktiv oder bereits entfernt) - ein Kandidat mit mehreren Zuordnungen zählt nur
// einmal. clientId filtert direkt auf client_assignments.client_id.
//
// Vorher: alle candidate_id-Zeilen laden und mit new Set(...).size in JS zaehlen - reine
// In-Memory-Zaehlung statt echter SQL-Aggregation (siehe Performance-Review 09.09.2026).
// PostgREST bietet kein natives COUNT(DISTINCT ...) über den REST-Endpunkt, daher jetzt
// eine SQL-Funktion (count_distinct_forwarded_candidates) statt einer PostgREST-Query.
export async function getForwardedCount(supabase: Supabase, clientId?: string): Promise<number> {
  const { data, error } = await (supabase as SupabaseWithForwardedCountRpc).rpc(
    "count_distinct_forwarded_candidates",
    { p_client_id: clientId ?? null }
  )
  if (error) throw new Error(error.message)
  return data ?? 0
}

export interface ClientKpis {
  forwarded: number
  // Kandidaten, bei denen ein Portalzugang den Status geändert oder die Zuordnung entfernt hat.
  touchedByClient: number
  hired: number
}

async function countDistinctCandidates(supabase: Supabase, clientId: string, filter: (q: ReturnType<typeof baseAssignments>) => ReturnType<typeof baseAssignments>): Promise<number> {
  const ids = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(baseAssignments(supabase, clientId)).range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) ids.add(r.candidate_id)
    if (!data || data.length < 1000) return ids.size
  }
}

function baseAssignments(supabase: Supabase, clientId: string) {
  return supabase.from("client_assignments").select("candidate_id").eq("client_id", clientId)
}

// Kennzahlen auf der Kundenseite (Paket 30, T-126): weitergeleitet, vom Kunden bearbeitet,
// eingestellt - je Kandidat einmal gezählt.
export async function getClientKpis(supabase: Supabase, clientId: string): Promise<ClientKpis> {
  const [forwarded, touchedByClient, hired] = await Promise.all([
    getForwardedCount(supabase, clientId),
    countDistinctCandidates(supabase, clientId, (q) => q.not("client_touched_at", "is", null)),
    countDistinctCandidates(supabase, clientId, (q) => q.eq("status", "ja")),
  ])
  return { forwarded, touchedByClient, hired }
}
