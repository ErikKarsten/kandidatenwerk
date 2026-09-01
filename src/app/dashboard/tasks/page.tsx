import { createSupabaseServerClient } from "@/lib/supabase-server"
import { TasksList } from "./tasks-list"

interface ProfileJoin {
  full_name: string | null
}
interface CandidateJoin {
  first_name: string
  last_name: string
}

export default async function TasksPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: taskRows }, { data: profileRows }, { data: candidateRows }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        `id, title, description, status, due_date, created_at, completed_at,
         assigned_to, created_by, candidate_id,
         assignee:profiles!tasks_assigned_to_fkey(full_name),
         creator:profiles!tasks_created_by_fkey(full_name),
         candidates(first_name, last_name)`
      )
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("candidates").select("id, first_name, last_name").order("last_name", { ascending: true }),
  ])

  const tasks = (taskRows ?? []).map((t) => {
    const assignee = (Array.isArray(t.assignee) ? t.assignee[0] : t.assignee) as ProfileJoin | null
    const creator = (Array.isArray(t.creator) ? t.creator[0] : t.creator) as ProfileJoin | null
    const candidate = (Array.isArray(t.candidates) ? t.candidates[0] : t.candidates) as CandidateJoin | null
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      due_date: t.due_date,
      created_at: t.created_at,
      completed_at: t.completed_at,
      assigned_to: t.assigned_to,
      created_by: t.created_by,
      candidate_id: t.candidate_id,
      assigneeName: assignee?.full_name ?? null,
      creatorName: creator?.full_name ?? null,
      candidateName: candidate ? `${candidate.first_name} ${candidate.last_name}` : null,
    }
  })

  const profiles = (profileRows ?? []).map((p) => ({ id: p.id, full_name: p.full_name }))
  const candidates = (candidateRows ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name} ${c.last_name}`,
  }))

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Aufgaben</h1>
        <p className="mt-1 text-sm text-gray-500">{tasks.length} Einträge</p>
      </div>

      <TasksList
        tasks={tasks}
        profiles={profiles}
        candidates={candidates}
        currentUserId={user?.id ?? ""}
      />
    </div>
  )
}
