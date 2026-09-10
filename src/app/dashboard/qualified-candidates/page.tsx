import { createSupabaseServerClient } from "@/lib/supabase-server"
import { QualifiedCandidatesList } from "./qualified-candidates-list"

export default async function QualifiedCandidatesPage() {
  const supabase = await createSupabaseServerClient()

  const { data: qualified } = await supabase
    .from("qualified_candidates")
    .select("id, candidate_id, added_at, criteria_reason")
    .order("added_at", { ascending: false })

  const candidateIds = (qualified ?? []).map((q) => q.candidate_id)

  // Zwei getrennte Abfragen statt PostgREST-Embedding: qualified_candidates -> eine
  // View (candidate_list_rows) einzubetten setzt eine PostgREST-erkennbare
  // Fremdschlüssel-Beziehung voraus, die eine View nicht mitbringt. Bei der erwarteten
  // Größe dieser Liste (kuratierte Auswahl, keine 600+ Kandidaten) ist der zweite
  // Query-Umweg vernachlässigbar.
  const { data: candidates } =
    candidateIds.length > 0
      ? await supabase
          .from("candidate_list_rows")
          .select("id, full_name, berufsbild, status, client_name, created_at")
          .in("id", candidateIds)
      : { data: [] }

  const candidateById = new Map((candidates ?? []).map((c) => [c.id, c]))

  // Generierte View-Spalten sind laut database.ts pauschal nullable (PostgREST gibt
  // fuer Views keine NOT-NULL-Constraints ans OpenAPI-Schema weiter) - id/full_name/
  // status sind ueber candidates.<spalte> NOT NULL abgesichert, daher hier bewusste
  // Fallbacks statt einer echten Null-Behandlung in der UI.
  const rows = (qualified ?? [])
    .map((q) => {
      const candidate = candidateById.get(q.candidate_id)
      if (!candidate) return null
      return {
        ...candidate,
        id: candidate.id ?? "",
        full_name: candidate.full_name ?? "",
        status: candidate.status ?? "",
        qualifiedId: q.id,
        addedAt: q.added_at,
        criteriaReason: q.criteria_reason,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Qualifizierte Kandidaten</h1>
        <p className="mt-1 text-sm text-gray-500">
          {rows.length} Kandidat{rows.length !== 1 ? "en" : ""} · automatisch kuratiert, aktualisiert sich
          regelmäßig im Hintergrund
        </p>
      </div>

      <QualifiedCandidatesList rows={rows} />
    </div>
  )
}
