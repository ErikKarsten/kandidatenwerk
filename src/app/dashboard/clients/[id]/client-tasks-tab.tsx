"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Circle, Plus } from "lucide-react"
import { TaskFormModal, type ProfileOption } from "@/components/dashboard/task-form-modal"
import { updateTaskStatusAction } from "@/app/dashboard/tasks/actions"
import { TaskAssigneeSelect } from "@/components/dashboard/task-assignee-select"

export interface ClientTask {
  id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  assigned_to: string
  assigneeName: string | null
}

function formatDate(d: string) {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })
}

// Reiter "Aufgaben" beim Kunden (Paket 13): Aufgaben zu diesem Kunden, z.B. die
// automatische "Kampagnenstatus prüfen" beim Wechsel in "Kampagne in Vorbereitung".
export function ClientTasksTab({ clientId, tasks, team }: { clientId: string; tasks: ClientTask[]; team: ProfileOption[] }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const open = tasks.filter((t) => t.status !== "erledigt")
  const done = tasks.filter((t) => t.status === "erledigt")

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Offene Aufgaben ({open.length})</h3>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
          <Plus size={13} /> Aufgabe anlegen
        </button>
      </div>
      {open.length === 0 && <p className="text-sm text-gray-400">Keine offenen Aufgaben.</p>}
      {open.map((t) => (
        <TaskRow key={t.id} task={t} team={team} />
      ))}
      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone(!showDone)} className="w-fit text-xs text-gray-500 hover:underline">
          {showDone ? "Erledigte ausblenden" : `Erledigte anzeigen (${done.length})`}
        </button>
      )}
      {showDone && done.map((t) => <TaskRow key={t.id} task={t} team={team} />)}
      {modalOpen && <TaskFormModal profiles={team} clientId={clientId} onClose={() => setModalOpen(false)} />}
    </div>
  )
}

function TaskRow({ task, team }: { task: ClientTask; team: ProfileOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const isDone = task.status === "erledigt"
  const overdue = !isDone && task.due_date && task.due_date < new Date().toISOString().slice(0, 10)

  return (
    <div className="flex items-start gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => (await updateTaskStatusAction(task.id, isDone ? "offen" : "erledigt"), router.refresh()))}
        className="mt-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-50"
        aria-label={isDone ? "Wieder öffnen" : "Erledigt"}
      >
        {isDone ? <CheckCircle2 size={16} style={{ color: "#1a9a6a" }} /> : <Circle size={16} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? "text-gray-400 line-through" : "font-medium text-gray-900"}`}>{task.title}</p>
        {task.description && <p className="text-xs text-gray-500">{task.description}</p>}
        <p className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
          {isDone ? (task.assigneeName ?? "Nicht zugewiesen") : <TaskAssigneeSelect taskId={task.id} assignedTo={task.assigned_to} team={team} />}
          {task.due_date && <span style={{ color: overdue ? "#dc2626" : undefined }}> · fällig {formatDate(task.due_date)}</span>}
        </p>
      </div>
    </div>
  )
}
