"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Plus, Trash2 } from "lucide-react"
import { updateTaskStatusAction, deleteTaskAction } from "./actions"
import { TaskFormModal, type ProfileOption } from "@/components/dashboard/task-form-modal"

export interface TaskListItem {
  id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  created_at: string
  completed_at: string | null
  assigned_to: string
  created_by: string
  candidate_id: string | null
  assigneeName: string | null
  creatorName: string | null
  candidateName: string | null
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
}

export function TasksList({
  tasks,
  profiles,
  currentUserId,
}: {
  tasks: TaskListItem[]
  profiles: ProfileOption[]
  currentUserId: string
}) {
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("mine")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("offen")
  const [modalOpen, setModalOpen] = useState(false)

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter === "mine" && t.assigned_to !== currentUserId) return false
      if (assigneeFilter === "created" && t.created_by !== currentUserId) return false
      if (statusFilter !== "alle" && t.status !== statusFilter) return false
      return true
    })
  }, [tasks, assigneeFilter, statusFilter, currentUserId])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterGroup value={assigneeFilter} options={ASSIGNEE_FILTER_OPTIONS} onChange={setAssigneeFilter} />
          <div className="mx-1 h-5 w-px" style={{ backgroundColor: "#dde3ea" }} />
          <FilterGroup value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
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
            <TaskRow key={task.id} task={task} currentUserId={currentUserId} />
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

function TaskRow({ task, currentUserId }: { task: TaskListItem; currentUserId: string }) {
  const router = useRouter()
  const [togglePending, startToggleTransition] = useTransition()
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deletePending, startDeleteTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const isDone = task.status === "erledigt"
  const isOwnTask = task.created_by === currentUserId
  const isOverdue = !isDone && !!task.due_date && new Date(task.due_date) < new Date(new Date().toDateString())

  function toggleDone() {
    setError(null)
    startToggleTransition(async () => {
      const result = await updateTaskStatusAction(task.id, isDone ? "offen" : "erledigt")
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    startDeleteTransition(async () => {
      const result = await deleteTaskAction(task.id)
      if (result?.error) { setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div
      className="flex items-start gap-3 rounded-xl border bg-white p-4"
      style={{ borderColor: "#dde3ea", opacity: isDone ? 0.65 : 1 }}
    >
      <input
        type="checkbox"
        checked={isDone}
        onChange={toggleDone}
        disabled={togglePending}
        className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
        aria-label={isDone ? "Als offen markieren" : "Als erledigt markieren"}
      />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900" style={{ textDecoration: isDone ? "line-through" : undefined }}>
          {task.title}
        </p>
        {task.description && (
          <p className="mt-0.5 text-sm text-gray-500 whitespace-pre-wrap">{task.description}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>Zugewiesen: {task.assigneeName ?? "Unbenannt"}</span>
          <span>Erstellt von: {task.creatorName ?? "Unbenannt"}</span>
          {task.due_date && (
            <span style={{ color: isOverdue ? "#dc2626" : undefined }}>
              Fällig: {formatDate(task.due_date)}
            </span>
          )}
          {task.candidate_id && task.candidateName && (
            <Link
              href={`/dashboard/candidates/${task.candidate_id}`}
              className="hover:underline"
              style={{ color: "#1e56a0" }}
            >
              Kandidat: {task.candidateName}
            </Link>
          )}
        </div>

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      {isOwnTask && (
        <div className="shrink-0">
          {deleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Löschen?</span>
              <button
                onClick={handleDelete}
                disabled={deletePending}
                className="rounded px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#dc2626" }}
              >
                Ja
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deletePending}
                className="rounded border px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: "#dde3ea" }}
              >
                Nein
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
              aria-label="Aufgabe löschen"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
