"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateAssignmentStatusAction } from "@/app/dashboard/candidates/[id]/actions"
import { ASSIGNMENT_STATUS_OPTIONS, assignmentStatusLabel } from "@/lib/assignment-status"

// Status beim Kunden (Neu, Vorstellungsgespräch, Eingestellt, Abgelehnt) im Backend setzen
// (Paket 31) - ab der Zuordnung gilt dieser Status statt des internen.
export function AssignmentStatusSelect({
  assignmentId,
  status,
  title,
  size = "sm",
  onChanged,
}: {
  assignmentId: string
  status: string
  title?: string
  size?: "sm" | "md"
  onChanged?: () => void
}) {
  const router = useRouter()
  const [current, setCurrent] = useState(status)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const colors = assignmentStatusLabel(current)

  function change(next: string) {
    const previous = current
    setCurrent(next)
    setError(null)
    startTransition(async () => {
      const res = await updateAssignmentStatusAction(assignmentId, next)
      if (res?.error) {
        setCurrent(previous)
        setError(res.error)
        return
      }
      onChanged?.()
      router.refresh()
    })
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <select
        value={current}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        title={title ?? "Status beim Kunden"}
        aria-label={title ?? "Status beim Kunden"}
        className={`cursor-pointer rounded-full border-0 font-medium focus:outline-none focus:ring-1 disabled:opacity-50 ${size === "md" ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {ASSIGNMENT_STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
