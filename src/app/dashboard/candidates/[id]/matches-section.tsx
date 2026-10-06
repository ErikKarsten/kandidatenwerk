"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateAssignmentStatusAction, removeClientAssignmentAction } from "./actions"
import { ASSIGNMENT_STATUS_OPTIONS } from "@/lib/assignment-status"

// Status-Liste und Farben zentral in src/lib/assignment-status.ts (Paket 15, T-71).
export { ASSIGNMENT_STATUS_OPTIONS, assignmentStatusLabel } from "@/lib/assignment-status"

export interface ActiveAssignment {
  id: string
  clientId: string
  status: string
  // Zuordnung zu einer Kanzlei-Kampagne (T-36); null = ältere Zuordnung "Kanzlei allgemein"
  campaignId?: string | null
  campaignTitle?: string | null
}

// Kompakte Status-/Entfernen-Steuerung für eine bestehende aktive Zuordnung - genutzt im
// Reiter Zuordnung (assignment-tab.tsx). Die frühere Match-Liste dieser Datei
// (MatchesSection) ist seit Atlas T-35 durch den Reiter ersetzt.
export function AssignmentControl({ assignment }: { assignment: ActiveAssignment }) {
  const router = useRouter()
  const [statusPending, startStatusTransition] = useTransition()
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const [removePending, startRemoveTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    setError(null)
    startStatusTransition(async () => {
      const result = await updateAssignmentStatusAction(assignment.id, newStatus)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove() {
    setError(null)
    startRemoveTransition(async () => {
      const result = await removeClientAssignmentAction(assignment.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400">Bereits zugeordnet</span>
      <select
        value={assignment.status}
        onChange={handleStatusChange}
        disabled={statusPending}
        className="rounded border px-1.5 py-0.5 text-xs focus:outline-none disabled:opacity-50"
        style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
      >
        {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {removeConfirm ? (
        <span className="flex items-center gap-1">
          <button
            onClick={handleRemove}
            disabled={removePending}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#dc2626" }}
          >
            Ja
          </button>
          <button
            onClick={() => setRemoveConfirm(false)}
            disabled={removePending}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Nein
          </button>
        </span>
      ) : (
        <button
          onClick={() => setRemoveConfirm(true)}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Entfernen
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
