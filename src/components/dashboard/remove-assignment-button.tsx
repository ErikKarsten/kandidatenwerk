"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { removeClientAssignmentAction } from "@/app/dashboard/candidates/[id]/actions"

// Zuordnung beenden (Paket 56, in der Kampagne seit Paket 62): Kandidat bleibt im Pool,
// verschwindet aus der Kanzlei und ihrem Portal; die Historie bleibt (removed_at).
export function RemoveAssignmentButton({ assignmentId, name }: { assignmentId: string; name: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await removeClientAssignmentAction(assignmentId)
      if (result?.error) {
        setError(result.error)
        return
      }
      setConfirm(false)
      router.refresh()
    })
  }

  if (confirm) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5">
          <button type="button" onClick={remove} disabled={pending} className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#dc2626" }}>
            {pending ? "…" : "Entfernen"}
          </button>
          <button type="button" onClick={() => setConfirm(false)} disabled={pending} className="rounded-md border px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50" style={{ borderColor: "#dde3ea" }}>
            Abbrechen
          </button>
        </span>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      title={`${name} von dieser Kanzlei entfernen – bleibt im Kandidatenpool`}
      className="whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-red-50"
      style={{ borderColor: "#fca5a5", color: "#dc2626" }}
    >
      Zuordnung entfernen
    </button>
  )
}
