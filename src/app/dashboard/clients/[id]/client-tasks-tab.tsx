"use client"

import type { ProfileOption } from "@/components/dashboard/task-form-modal"
import { TasksPanel } from "@/components/dashboard/tasks-panel"
import type { TaskItemData } from "@/components/dashboard/task-item"

export type ClientTask = TaskItemData

// Reiter "Aufgaben" beim Kunden (Paket 13): Aufgaben zu diesem Kunden, z.B. die
// automatische "Kampagnenstatus prüfen" beim Wechsel in "Kampagne in Vorbereitung".
export function ClientTasksTab({ clientId, tasks, team, currentUserId }: { clientId: string; tasks: ClientTask[]; team: ProfileOption[]; currentUserId: string }) {
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <TasksPanel tasks={tasks} team={team} currentUserId={currentUserId} clientId={clientId} />
    </div>
  )
}
