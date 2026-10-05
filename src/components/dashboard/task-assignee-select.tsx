"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateTaskAssigneeAction } from "@/app/dashboard/tasks/actions"
import type { ProfileOption } from "@/components/dashboard/task-form-modal"

// Aufgabe neu zuweisen (Paket 14, T-69). Die neue Person bekommt sofort eine Mail.
export function TaskAssigneeSelect({
  taskId,
  assignedTo,
  team,
  onError,
}: {
  taskId: string
  assignedTo: string
  team: ProfileOption[]
  onError?: (message: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const options = team.some((p) => p.id === assignedTo) ? team : [{ id: assignedTo, full_name: "Unbekannt" }, ...team]

  return (
    <select
      value={assignedTo}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value
        startTransition(async () => {
          const result = await updateTaskAssigneeAction(taskId, next)
          if (result?.error) onError?.(result.error)
          router.refresh()
        })
      }}
      className="max-w-[12rem] rounded border bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-50"
      style={{ borderColor: "#dde3ea" }}
      aria-label="Zugewiesen an"
    >
      {options.map((p) => (
        <option key={p.id} value={p.id}>
          {p.full_name ?? "Unbenannt"}
        </option>
      ))}
    </select>
  )
}
