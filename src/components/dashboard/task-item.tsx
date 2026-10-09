"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, RotateCcw, Trash2 } from "lucide-react"
import { deleteTaskAction, updateTaskStatusAction } from "@/app/dashboard/tasks/actions"
import { TaskAssigneeSelect } from "@/components/dashboard/task-assignee-select"
import type { ProfileOption } from "@/components/dashboard/task-form-modal"
import { assigneeValue } from "@/lib/teams"

export interface TaskItemData {
  id: string
  title: string
  description: string | null
  status: string
  due_date: string | null
  assigned_to: string | null
  assigned_team: string | null
  assigneeName: string | null
  created_by?: string | null
  creatorName?: string | null
  candidate_id?: string | null
  candidateName?: string | null
  client_id?: string | null
  clientName?: string | null
}

function formatDate(d: string) {
  return new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })
}

// Eine Aufgabe mit klaren Buttons rechts (Paket 46): "Erledigt"/"Wieder öffnen" und - für
// die Person, die sie angelegt hat - "Löschen". Genutzt in der Aufgabenliste sowie in den
// Reitern "Aufgaben" bei Kunde und Kandidat. Links öffnen Kandidat/Kunde direkt im Reiter
// "Aufgaben", damit man die Aufgabe dort abschließen kann.
export function TaskItem({
  task,
  team,
  currentUserId,
  showLinks = true,
}: {
  task: TaskItemData
  team: ProfileOption[]
  currentUserId: string
  showLinks?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDone = task.status === "erledigt"
  const canDelete = !!task.created_by && task.created_by === currentUserId
  const overdue = !isDone && !!task.due_date && task.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10)

  function run(action: () => Promise<{ error: string } | null>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      setConfirmDelete(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border bg-white p-4 sm:flex-nowrap" style={{ borderColor: "#dde3ea", opacity: isDone ? 0.7 : 1 }}>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? "text-gray-500 line-through" : "font-medium text-gray-900"}`}>{task.title}</p>
        {task.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-500">{task.description}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            Zugewiesen:
            {isDone ? task.assigneeName ?? "Unbenannt" : <TaskAssigneeSelect taskId={task.id} assignedTo={assigneeValue(task)} team={team} onError={setError} />}
          </span>
          {task.creatorName && <span>Erstellt von: {task.creatorName}</span>}
          {task.due_date && <span style={{ color: overdue ? "#dc2626" : undefined }}>Fällig: {formatDate(task.due_date)}</span>}
          {showLinks && task.candidate_id && task.candidateName && (
            <Link href={`/dashboard/candidates/${task.candidate_id}?tab=aufgaben`} className="hover:underline" style={{ color: "#1e56a0" }}>
              Kandidat: {task.candidateName}
            </Link>
          )}
          {showLinks && task.client_id && task.clientName && (
            <Link href={`/dashboard/clients/${task.client_id}?tab=aufgaben`} className="hover:underline" style={{ color: "#1e56a0" }}>
              Kunde: {task.clientName}
            </Link>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {confirmDelete ? (
          <>
            <span className="text-xs text-gray-500">Wirklich löschen?</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteTaskAction(task.id))} className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#dc2626" }}>
              Ja, löschen
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirmDelete(false)} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50" style={{ borderColor: "#dde3ea" }}>
              Abbrechen
            </button>
          </>
        ) : (
          <>
            {isDone ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateTaskStatusAction(task.id, "offen"))}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: "#dde3ea" }}
              >
                <RotateCcw size={14} /> Wieder öffnen
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => updateTaskStatusAction(task.id, "erledigt"))}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1a9a6a" }}
              >
                <Check size={14} /> Erledigt
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                style={{ borderColor: "#fca5a5", color: "#dc2626" }}
                aria-label="Aufgabe löschen"
              >
                <Trash2 size={14} /> Löschen
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
