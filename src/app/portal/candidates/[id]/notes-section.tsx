"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createNoteAction } from "../../actions"

export interface Note {
  id: string
  content: string
  created_at: string
  isOwn: boolean
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })
}

export function NotesSection({
  clientAssignmentId,
  notes,
}: {
  clientAssignmentId: string
  notes: Note[]
}) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleAdd() {
    startTransition(async () => {
      const result = await createNoteAction(clientAssignmentId, content)
      if (result?.error) { setError(result.error); return }
      setContent("")
      setError(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Meine Notizen ({notes.length})
      </span>

      {notes.length === 0 && (
        <p className="text-sm text-gray-400">Noch keine Notizen zu diesem Kandidaten.</p>
      )}

      {notes.map((n) => (
        <div key={n.id} className="rounded-lg border p-3" style={{ borderColor: "#dde3ea", backgroundColor: n.isOwn ? "#f8fafc" : "white" }}>
          <p className="text-sm text-gray-900 whitespace-pre-wrap">{n.content}</p>
          <p className="text-xs text-gray-400 mt-1.5">
            {n.isOwn ? "Von dir" : "Vom Team"} · {formatDate(n.created_at)}
          </p>
        </div>
      ))}

      <div className="flex flex-col gap-2 pt-1">
        <textarea
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
          style={{ borderColor: "#dde3ea" }}
          rows={3}
          placeholder="Notiz hinzufügen…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div>
          <button
            onClick={handleAdd}
            disabled={pending || !content.trim()}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {pending ? "Wird gespeichert…" : "Notiz speichern"}
          </button>
        </div>
      </div>
    </div>
  )
}
