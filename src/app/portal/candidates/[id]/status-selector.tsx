"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updatePortalAssignmentStatusAction } from "../../actions"

// Gleiche deutsche Labels wie in page.tsx (Anzeige des tatsächlichen Status, alle 6
// internen Werte) - eigene, kleine Kopie statt geteiltem Import, siehe bestehendes
// Muster bei den Portal-STATUS_LABELS (matches-section.tsx-Kommentar).
const STATUS_LABELS: Record<string, string> = {
  inbox: "Unbearbeitet",
  vq: "Vorqualifiziert",
  vqk: "Vorqualifiziert beim Kunden",
  vg: "Interview vereinbart",
  ja: "Angenommen",
  nein: "Abgelehnt",
}

// Reduzierte, kundenfreundliche Auswahl (Anfrage vom 28.09.2026, Punkt 1) - die drei
// internen Vorstufen (inbox/vq/vqk) bleiben nur für Staff änderbar und tauchen hier
// bewusst nicht als Option auf, unabhängig vom aktuell angezeigten Status oben.
const PORTAL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "vg", label: "Interview vereinbart" },
  { value: "ja", label: "Angenommen" },
  { value: "nein", label: "Abgelehnt" },
]

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
          style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}
        >
          {STATUS_LABELS[currentStatus] ?? currentStatus}
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
