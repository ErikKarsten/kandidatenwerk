"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Building2 } from "lucide-react"
import {
  assignToClientAction,
  removeClientAssignmentAction,
  updateAssignmentStatusAction,
} from "./actions"

export interface ClientAssignment {
  id: string
  status: string
  clientId: string
  clientName: string
}

export interface ClientOption {
  id: string
  name: string
}

// Deutsche Labels für die Stecktafel-Status-Pipeline (inbox/vq/vqk/vg/ja/nein), siehe
// CHECK-Constraint auf client_assignments.status.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "inbox", label: "Unbearbeitet" },
  { value: "vq", label: "Vorqualifiziert" },
  { value: "vqk", label: "Vorqualifiziert beim Kunden" },
  { value: "vg", label: "Vorstellungsgespräch" },
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
]

export function ClientAssignmentSection({
  candidateId,
  assignment,
  clients,
}: {
  candidateId: string
  assignment: ClientAssignment | null
  clients: ClientOption[]
}) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Kanzlei-Zuordnung
      </p>
      {assignment ? (
        <ActiveAssignment assignment={assignment} />
      ) : (
        <AssignForm candidateId={candidateId} clients={clients} />
      )}
    </div>
  )
}

function AssignForm({ candidateId, clients }: { candidateId: string; clients: ClientOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleAssign() {
    if (!clientId) return
    setError(null)
    startTransition(async () => {
      const result = await assignToClientAction(candidateId, clientId)
      if (result?.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      setClientId("")
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
      >
        <Building2 size={14} />
        Kanzlei zuordnen
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <select
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        className="rounded-md border px-2.5 py-1.5 text-sm focus:outline-none"
        style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
      >
        <option value="" disabled>Kunde auswählen…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleAssign}
          disabled={pending || !clientId}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {pending ? "Wird zugeordnet…" : "Zuordnen"}
        </button>
        <button
          onClick={() => { setOpen(false); setError(null); setClientId("") }}
          disabled={pending}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function ActiveAssignment({ assignment }: { assignment: ClientAssignment }) {
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
    <div className="flex flex-col gap-3">
      <Link
        href={`/dashboard/clients/${assignment.clientId}`}
        className="text-sm font-medium hover:underline"
        style={{ color: "#1e56a0" }}
      >
        {assignment.clientName}
      </Link>

      <select
        value={assignment.status}
        onChange={handleStatusChange}
        disabled={statusPending}
        className="rounded-md border px-2.5 py-1.5 text-sm focus:outline-none disabled:opacity-50"
        style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {removeConfirm ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Zuordnung entfernen?</span>
          <button
            onClick={handleRemove}
            disabled={removePending}
            className="rounded px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#dc2626" }}
          >
            Ja
          </button>
          <button
            onClick={() => setRemoveConfirm(false)}
            disabled={removePending}
            className="rounded border px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: "#dde3ea" }}
          >
            Nein
          </button>
        </div>
      ) : (
        <button
          onClick={() => setRemoveConfirm(true)}
          className="self-start text-xs text-gray-500 hover:text-red-600"
        >
          Zuordnung entfernen
        </button>
      )}
    </div>
  )
}
