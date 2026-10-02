"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateBugReportAssigneeAction } from "@/lib/bug-reports/actions"

// Wer bekommt Aufgaben aus Fehlermeldungen zugewiesen? Leer = erster Admin der Agentur.
export function AssigneeSelect({
  team,
  assigneeId,
}: {
  team: { id: string; name: string; role: string }[]
  assigneeId: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(assigneeId ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleChange(next: string) {
    setValue(next)
    setError(null)
    startTransition(async () => {
      const result = await updateBugReportAssigneeAction(next || null)
      if (result?.error) {
        setError(result.error)
        setValue(assigneeId ?? "")
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">Aufgaben aus Fehlermeldungen zuweisen an</label>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={pending}
        className="rounded-md border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
        style={{ borderColor: "#dde3ea" }}
      >
        <option value="">Erster Admin (Standard)</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.role === "agency_admin" ? "Admin" : "Mitarbeiter"})
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
