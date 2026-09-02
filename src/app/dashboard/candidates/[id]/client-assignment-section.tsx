"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { assignToClientAction } from "./actions"

export interface ClientOption {
  id: string
  name: string
}

// Kompakter "+ Weitere Kanzlei hinzufügen"-Knopf mit Dropdown-Auswahl aller Kunden -
// läuft unabhängig von automatischen Matches (immer sichtbar oberhalb der
// Kampagnen-Liste in matches-section.tsx), da ein Kandidat inzwischen gleichzeitig
// mehreren Kanzleien zugeordnet sein kann (siehe assignToClientAction: keine
// Ein-Kanzlei-Beschränkung mehr). War früher Teil der jetzt entfernten
// ClientAssignmentSection-Karte, Logik unverändert wiederverwendet.
export function AddClientAssignmentButton({
  candidateId,
  clients,
}: {
  candidateId: string
  clients: ClientOption[]
}) {
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
        className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
        style={{ color: "#1e56a0" }}
      >
        <Plus size={12} />
        Weitere Kanzlei hinzufügen
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
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
