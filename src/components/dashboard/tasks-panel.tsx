"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { TaskFormModal, type ProfileOption } from "@/components/dashboard/task-form-modal"
import { TaskItem, type TaskItemData } from "@/components/dashboard/task-item"

// Reiter "Aufgaben" bei Kunde (Paket 13) und Kandidat (Paket 46): offene Aufgaben, Erledigte
// aufklappbar, neue Aufgabe mit festem Bezug.
export function TasksPanel({
  tasks,
  team,
  currentUserId,
  clientId,
  candidateId,
}: {
  tasks: TaskItemData[]
  team: ProfileOption[]
  currentUserId: string
  clientId?: string
  candidateId?: string
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const open = tasks.filter((t) => t.status !== "erledigt")
  const done = tasks.filter((t) => t.status === "erledigt")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Offene Aufgaben ({open.length})</h3>
        <button type="button" onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: "#1e56a0" }}>
          <Plus size={14} /> Aufgabe anlegen
        </button>
      </div>
      {open.length === 0 && <p className="text-sm text-gray-400">Keine offenen Aufgaben.</p>}
      {open.map((t) => (
        <TaskItem key={t.id} task={t} team={team} currentUserId={currentUserId} showLinks={false} />
      ))}
      {done.length > 0 && (
        <button type="button" onClick={() => setShowDone(!showDone)} className="w-fit text-xs text-gray-500 hover:underline">
          {showDone ? "Erledigte ausblenden" : `Erledigte anzeigen (${done.length})`}
        </button>
      )}
      {showDone && done.map((t) => <TaskItem key={t.id} task={t} team={team} currentUserId={currentUserId} showLinks={false} />)}
      {modalOpen && <TaskFormModal profiles={team} clientId={clientId} candidateId={candidateId} onClose={() => setModalOpen(false)} />}
    </div>
  )
}
