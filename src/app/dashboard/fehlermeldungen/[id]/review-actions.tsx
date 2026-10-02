"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  approveBugReportAction,
  rejectBugReportAction,
  setBugReportStatusAction,
} from "@/lib/bug-reports/actions"
import type { BugReportStatus } from "@/lib/bug-reports/shared"

export function ReviewActions({ reportId, status }: { reportId: string; status: BugReportStatus }) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const open = status === "neu" || status === "in_pruefung"

  function run(action: () => Promise<{ error: string } | null>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      setNote("")
      router.refresh()
    })
  }

  if (!open) {
    return status === "freigegeben" ? (
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => setBugReportStatusAction(reportId, "erledigt"))}
        className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        style={{ borderColor: "#dde3ea" }}
      >
        Als erledigt markieren
      </button>
    ) : null
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Notiz (bei Ablehnung Pflicht, z.B. Begründung für den Kunden-Kontakt)"
        className="w-full resize-none rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
        style={{ borderColor: "#dde3ea" }}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveBugReportAction(reportId, note))}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          Freigeben & Aufgabe anlegen
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => rejectBugReportAction(reportId, note))}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          style={{ borderColor: "#fca5a5", color: "#dc2626" }}
        >
          Ablehnen
        </button>
        {status === "neu" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setBugReportStatusAction(reportId, "in_pruefung"))}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: "#dde3ea" }}
          >
            In Prüfung nehmen
          </button>
        )}
      </div>
    </div>
  )
}
