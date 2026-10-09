"use client"

import { useMemo, useState } from "react"
import { Plus } from "lucide-react"
import { TaskFormModal, type ProfileOption } from "@/components/dashboard/task-form-modal"
import { TaskItem } from "@/components/dashboard/task-item"
import { isAssignedTo } from "@/lib/teams"
import { berlinDate, DUE_FILTER_OPTIONS, matchesDue, type DueFilter } from "@/lib/task-due"

export interface TaskListItem {
  id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  created_at: string
  completed_at: string | null
  assigned_to: string | null
  // Team-Aufgabe (Paket 44): statt einer Person ein ganzes Team.
  assigned_team: string | null
  created_by: string
  candidate_id: string | null
  assigneeName: string | null
  creatorName: string | null
  candidateName: string | null
  client_id?: string | null
  clientName?: string | null
}

type AssigneeFilter = "mine" | "created" | "all"
type StatusFilter = "offen" | "erledigt" | "alle"

const ASSIGNEE_FILTER_OPTIONS: { value: AssigneeFilter; label: string }[] = [
  { value: "mine", label: "Mir zugewiesen" },
  { value: "created", label: "Von mir erstellt" },
  { value: "all", label: "Alle" },
]

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "offen", label: "Offen" },
  { value: "erledigt", label: "Erledigt" },
  { value: "alle", label: "Alle" },
]

export function TasksList({
  tasks,
  profiles,
  currentUserId,
  currentUserTeam,
}: {
  tasks: TaskListItem[]
  profiles: ProfileOption[]
  currentUserId: string
  currentUserTeam: string | null
}) {
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("mine")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("offen")
  // Fälligkeit (Paket 48): überfällig, heute, diese Woche, ohne Datum.
  const [dueFilter, setDueFilter] = useState<DueFilter>("alle")
  const [today] = useState(() => berlinDate())
  const [modalOpen, setModalOpen] = useState(false)

  const baseTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter === "mine" && !isAssignedTo(t, currentUserId, currentUserTeam)) return false
      if (assigneeFilter === "created" && t.created_by !== currentUserId) return false
      if (statusFilter !== "alle" && t.status !== statusFilter) return false
      return true
    })
  }, [tasks, assigneeFilter, statusFilter, currentUserId, currentUserTeam])
  const filteredTasks = useMemo(() => baseTasks.filter((t) => matchesDue(t.due_date, dueFilter, today)), [baseTasks, dueFilter, today])
  // Anzahl je Fälligkeit innerhalb der übrigen Filter, z. B. "Heute (3)".
  const dueOptions = DUE_FILTER_OPTIONS.map((o) => {
    const n = baseTasks.filter((t) => matchesDue(t.due_date, o.value, today)).length
    return { value: o.value, label: o.value === "alle" ? o.label : `${o.label} (${n})` }
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup value={assigneeFilter} options={ASSIGNEE_FILTER_OPTIONS} onChange={setAssigneeFilter} />
          <div className="mx-1 h-5 w-px" style={{ backgroundColor: "#dde3ea" }} />
          <FilterGroup value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
          <div className="mx-1 h-5 w-px" style={{ backgroundColor: "#dde3ea" }} />
          <FilterGroup value={dueFilter} options={dueOptions} onChange={setDueFilter} />
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          <Plus size={16} />
          Neue Aufgabe
        </button>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Aufgaben entsprechen den aktuellen Filtern.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filteredTasks.map((task) => (
            <TaskItem key={task.id} task={task} currentUserId={currentUserId} team={profiles} />
          ))}
        </div>
      )}

      {modalOpen && (
        <TaskFormModal profiles={profiles} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}

function FilterGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
          style={{
            backgroundColor: value === opt.value ? "#1e56a0" : "white",
            color: value === opt.value ? "white" : "#6b7280",
            border: `1px solid ${value === opt.value ? "#1e56a0" : "#dde3ea"}`,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
