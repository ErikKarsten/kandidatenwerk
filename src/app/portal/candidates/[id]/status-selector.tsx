"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updatePortalAssignmentStatusAction } from "../../actions"
import { ASSIGNMENT_STATUS_OPTIONS, PORTAL_ASSIGNMENT_STATUS_VALUES, assignmentStatusLabel } from "@/lib/assignment-status"

// Status-Namen zentral in src/lib/assignment-status.ts - identisch zum Backend (Paket 15).
const PORTAL_STATUS_OPTIONS = ASSIGNMENT_STATUS_OPTIONS.filter((o) => PORTAL_ASSIGNMENT_STATUS_VALUES.includes(o.value))

export function PortalStatusSelector({
  clientAssignmentId,
  currentStatus,
}: {
  clientAssignmentId: string
  currentStatus: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value
    if (!value) return
    setError(null)
    startTransition(async () => {
      const result = await updatePortalAssignmentStatusAction(clientAssignmentId, value)
      if (result?.error) {
        setError(result.error)
        return
      }
      e.target.value = ""
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: assignmentStatusLabel(currentStatus).bg, color: assignmentStatusLabel(currentStatus).text }}
        >
          {assignmentStatusLabel(currentStatus).label}
        </span>
        <select
          defaultValue=""
          onChange={handleChange}
          disabled={pending}
          className="rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1 disabled:opacity-50"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="">{pending ? "Wird gespeichert…" : "Status ändern…"}</option>
          {PORTAL_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  )
}
