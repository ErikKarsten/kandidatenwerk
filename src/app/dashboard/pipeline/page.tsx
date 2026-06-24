export const runtime = 'edge';

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { KanbanBoard } from "./kanban-board"

export default async function PipelinePage() {
  const supabase = await createSupabaseServerClient()

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, email, status, source, created_at")
    .order("created_at", { ascending: false })

  return (
    <div className="flex flex-col gap-6 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="mt-1 text-sm text-gray-500">
          {candidates?.length ?? 0} Kandidaten — per Drag &amp; Drop verschieben
        </p>
      </div>
      <KanbanBoard initialCandidates={candidates ?? []} />
    </div>
  )
}
