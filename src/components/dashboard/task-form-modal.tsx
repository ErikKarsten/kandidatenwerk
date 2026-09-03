"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createTaskAction } from "@/app/dashboard/tasks/actions"

export interface ProfileOption {
  id: string
  full_name: string | null
}

function profileLabel(p: ProfileOption): string {
  return p.full_name ?? "Unbenannt"
}

const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

// Gemeinsames "Neue Aufgabe"-Formular für beide Einstiegspunkte: den allgemeinen
// Knopf auf /dashboard/tasks (ohne candidateId - Aufgabe ohne Kandidatenbezug) und den
// "Aufgabe erstellen"-Knopf direkt auf der Kandidatenseite (candidateId fest vorgegeben,
// kein Auswahlfeld nötig, da der Kandidat durch den Aufrufkontext schon eindeutig ist).
export function TaskFormModal({
  profiles,
  candidateId,
  onClose,
  onCreated,
}: {
  profiles: ProfileOption[]
  candidateId?: string
  onClose: () => void
  // Optional statt immer router.refresh(): die Kandidatenseite zeigt selbst keine
  // Aufgabenliste an, für die ein Refresh nötig wäre (siehe candidate-detail.tsx).
  onCreated?: () => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [assignedTo, setAssignedTo] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !assignedTo) return

    setError(null)
    const fd = new FormData()
    fd.append("title", title.trim())
    if (description.trim()) fd.append("description", description.trim())
    fd.append("assigned_to", assignedTo)
    if (dueDate) fd.append("due_date", dueDate)
    if (candidateId) fd.append("candidate_id", candidateId)

    startTransition(async () => {
      const result = await createTaskAction(fd)
      if (result?.error) { setError(result.error); return }
      onClose()
      if (onCreated) onCreated()
      else router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border bg-white shadow-xl" style={{ borderColor: "#dde3ea" }}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6">
          <h2 className="text-base font-semibold text-gray-900">Neue Aufgabe</h2>

          <Field label="Titel" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={inputClass}
              style={inputStyle}
              placeholder="z.B. Lebenslauf nachfordern"
            />
          </Field>

          <Field label="Beschreibung">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              style={inputStyle}
            />
          </Field>

          <Field label="Zuweisen an" required>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              required
              className={inputClass}
              style={{ ...inputStyle, backgroundColor: "white" }}
            >
              <option value="" disabled>Person auswählen…</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{profileLabel(p)}</option>
              ))}
            </select>
          </Field>

          <Field label="Fällig am">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              {pending ? "Wird gespeichert…" : "Aufgabe anlegen"}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
