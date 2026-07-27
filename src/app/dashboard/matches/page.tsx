import { createSupabaseServerClient } from "@/lib/supabase-server"
import { MatchesList } from "./matches-list"

export default async function MatchesPage() {
  const supabase = await createSupabaseServerClient()

  const { data: matches } = await supabase
    .from("candidate_campaign_matches")
    .select(
      "id, distance_km, status, matched_at, candidates(id, first_name, last_name), campaigns(id, title, clients(id, name))"
    )
    .order("matched_at", { ascending: false })

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Matching</h1>
        <p className="mt-1 text-sm text-gray-500">{matches?.length ?? 0} Einträge</p>
      </div>

      <MatchesList matches={matches ?? []} />
    </div>
  )
}
