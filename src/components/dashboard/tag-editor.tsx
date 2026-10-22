"use client"

import { useId, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { updateCandidateTagsAction } from "@/app/dashboard/candidates/[id]/actions"
import { normalizeTags } from "@/lib/candidate-tags"

export function TagChip({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#6366f118", color: "#4338ca" }}>
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded-full hover:bg-indigo-100" aria-label={`Tag ${tag} entfernen`}>
          <X size={11} />
        </button>
      )}
    </span>
  )
}

// Tags eines Kandidaten bearbeiten (Paket 28, T-115): Chips mit x, neues Tag per Enter;
// bekannte Tags werden vorgeschlagen. compact (Paket 64): statt dauerhaftem Eingabefeld ein
// dezenter "+ Tag"-Knopf, das Feld erscheint erst beim Klick.
export function TagEditor({
  candidateId,
  tags,
  knownTags = [],
  onChanged,
  compact = false,
  hiddenTags = [],
}: {
  candidateId: string
  tags: string[]
  knownTags?: string[]
  onChanged?: () => void
  compact?: boolean
  // Nicht angezeigte Tags (z. B. Musterdatensatz für Nicht-Admins) bleiben beim Speichern erhalten.
  hiddenTags?: string[]
}) {
  const router = useRouter()
  const listId = useId()
  const [current, setCurrent] = useState(tags)
  const [input, setInput] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)

  function save(next: string[]) {
    const normalized = normalizeTags(next)
    const previous = current
    setCurrent(normalized)
    setError(null)
    startTransition(async () => {
      const res = await updateCandidateTagsAction(candidateId, normalizeTags([...normalized, ...hiddenTags]))
      if (res?.error) {
        setCurrent(previous)
        setError(res.error)
        return
      }
      onChanged?.()
      router.refresh()
    })
  }

  function add() {
    if (!input.trim()) return
    save([...current, input])
    setInput("")
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {current.map((t) => (
          <TagChip key={t} tag={t} onRemove={pending ? undefined : () => save(current.filter((x) => x !== t))} />
        ))}
        {compact && !adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 disabled:opacity-50"
            style={{ borderColor: "#cbd5e1" }}
          >
            <Plus size={12} /> Tag
          </button>
        ) : (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus={compact}
            value={input}
            list={listId}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
              if (e.key === "Escape" && compact) {
                setInput("")
                setAdding(false)
              }
            }}
            onBlur={() => {
              if (compact && !input.trim()) setAdding(false)
            }}
            placeholder="Tag hinzufügen"
            disabled={pending}
            className="w-32 rounded-md border px-2 py-0.5 text-xs focus:outline-none"
            style={{ borderColor: "#dde3ea" }}
          />
          <datalist id={listId}>
            {knownTags.filter((t) => !current.includes(t)).map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
          <button type="button" onClick={add} disabled={pending || !input.trim()} className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-40" aria-label="Tag hinzufügen">
            <Plus size={14} />
          </button>
        </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
