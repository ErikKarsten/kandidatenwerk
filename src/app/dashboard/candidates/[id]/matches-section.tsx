"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateAssignmentStatusAction, removeClientAssignmentAction } from "./actions"

// Deutsche Labels für die Stecktafel-Status-Pipeline (inbox/vq/vqk/vg/ja/nein), siehe
// CHECK-Constraint auf client_assignments.status - gleiche Liste wie zuvor in der
// entfernten ClientAssignmentSection. Exportiert, damit andere Stellen (z.B. die
// Status-Badges oben auf der Kandidatenseite) dieselbe Liste verwenden statt sie zu
// duplizieren.
export const ASSIGNMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "inbox", label: "Unbearbeitet" },
  { value: "vq", label: "Vorqualifiziert" },
  { value: "vqk", label: "Vorqualifiziert beim Kunden" },
  { value: "vg", label: "Vorstellungsgespräch" },
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
]

// Farben an die gleichnamigen/sinnverwandten CANDIDATE_STATUS_OPTIONS angelehnt (z.B.
// "vg"/Vorstellungsgespräch wie "interview", "ja" wie "platziert", "nein" wie
// "nicht_erreicht_mail") - kein bisheriger Farb-Helfer für diesen Status existierte,
// jetzt zentral hier definiert und exportiert, damit die neuen, nicht editierbaren
// Badges auf der Kandidatenseite (candidate-detail.tsx) dasselbe Muster nutzen statt
// eigene Farben zu erfinden.
const ASSIGNMENT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  inbox: { bg: "#9ca3af18", text: "#6b7280" },
  vq: { bg: "#0ea5e918", text: "#0369a1" },
  vqk: { bg: "#14b8a618", text: "#0f766e" },
  vg: { bg: "#1e56a018", text: "#1e56a0" },
  ja: { bg: "#1a9a6a18", text: "#1a9a6a" },
  nein: { bg: "#ef444418", text: "#b91c1c" },
}
const ASSIGNMENT_STATUS_FALLBACK_COLORS = { bg: "#9ca3af18", text: "#6b7280" }

export function assignmentStatusLabel(status: string): { label: string; bg: string; text: string } {
  const opt = ASSIGNMENT_STATUS_OPTIONS.find((o) => o.value === status)
  const colors = ASSIGNMENT_STATUS_COLORS[status] ?? ASSIGNMENT_STATUS_FALLBACK_COLORS
  return {
    label: opt?.label ?? status,
    bg: colors.bg,
    text: colors.text,
  }
}

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
