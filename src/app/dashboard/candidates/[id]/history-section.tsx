"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, StickyNote, Circle, Trash2, Mail, CheckSquare, PhoneCall } from "lucide-react"
import { addNoteAction, deleteNoteAction } from "./actions"
import { AutoTextarea } from "@/components/ui/auto-textarea"
import { referenceQueryAt, splitReferences } from "@/lib/comment-text"

// Für @Erwähnungen und #Aufgaben in Notizen (Paket 78).
export interface HistoryPerson {
  id: string
  full_name: string | null
}

export interface HistoryTask {
  id: string
  title: string
  status: string
  assigneeName: string | null
}

type Suggestion = { key: string; insert: string; label: string; hint?: string | null }

// Notiztext mit hervorgehobenen @Kollegen und anklickbaren #Aufgaben.
function NoteText({ text, names, tasks, onOpenTask }: { text: string; names: string[]; tasks: HistoryTask[]; onOpenTask?: (id: string) => void }) {
  const parts = splitReferences(
    text,
    names,
    tasks.map((t) => t.title)
  )
  return (
    <p className="text-sm text-gray-700 whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.type === "mention") {
          return (
            <span key={i} className="rounded px-1 font-medium" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
              @{part.value}
            </span>
          )
        }
        if (part.type === "task") {
          const task = tasks.find((t) => t.title === part.value)
          const done = task?.status === "erledigt"
          return (
            <button
              key={i}
              type="button"
              onClick={() => task && onOpenTask?.(task.id)}
              className="inline-flex items-center gap-1 rounded border px-1 align-baseline text-xs font-medium hover:bg-amber-50"
              style={{ borderColor: "#fcd34d", backgroundColor: "#fffbeb", color: "#92400e" }}
              title={task ? `Aufgabe${task.assigneeName ? ` · ${task.assigneeName}` : ""}${done ? " · erledigt" : ""} – im Reiter „Aufgaben“ öffnen` : undefined}
            >
              <CheckSquare size={11} />
              <span className={done ? "line-through" : undefined}>{part.value}</span>
            </button>
          )
        }
        return <span key={i}>{part.value}</span>
      })}
    </p>
  )
}

// Schnellbausteine für die eigene Notiz im Verlauf (Paket 77): ein Klick übernimmt den Text,
// Details lassen sich vor dem Speichern ergänzen.
const QUICK_NOTES = ["Angerufen – nicht erreicht", "Mailbox besprochen", "Telefoniert", "Termin vereinbart", "Unterlagen angefordert", "Unterlagen erhalten"]

export interface HistoryEntry {
  id: string
  type: string | null
  content: string | null
  created_at: string
  createdByName: string | null
}

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

function formatEntryTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}, ${hours}:${minutes}`
}

function formatGroupLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", { day: "numeric", month: "long" })
}

function dateKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

const TYPE_ICON: Record<string, typeof ArrowRightLeft> = {
  status_change: ArrowRightLeft,
  note: StickyNote,
  automation: Mail,
  email: Mail,
  call: PhoneCall,
}

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  status_change: { bg: "#1e56a018", text: "#1e56a0" },
  note: { bg: "#9ca3af18", text: "#6b7280" },
  automation: { bg: "#1a9a6a18", text: "#1a9a6a" },
  email: { bg: "#8b5cf618", text: "#7c3aed" },
  // Anrufe über sipgate (Paket 92).
  call: { bg: "#1a9a6a18", text: "#1a9a6a" },
}
const FALLBACK_COLOR = { bg: "#9ca3af18", text: "#6b7280" }

const DESCRIPTION_PREVIEW_LENGTH = 300

// Gemeinsame Darstellung für beide Leadtable-Textblöcke unten (Beschreibung + weitere
// Antworten) - selbes "lang? dann einklappen"-Verhalten, nur Titel und Inhalt variieren.
function CollapsibleTextBlock({ title, text }: { title: string; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > DESCRIPTION_PREVIEW_LENGTH
  const shownText = expanded || !isLong ? text : `${text.slice(0, DESCRIPTION_PREVIEW_LENGTH)}…`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      <div className="rounded-lg border px-3 py-2" style={{ borderColor: "#dde3ea" }}>
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{shownText}</p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs font-medium hover:underline"
            style={{ color: "#1e56a0" }}
          >
            {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
          </button>
        )}
      </div>
    </div>
  )
}

// Konsolidierte Verlaufs-Anzeige für die rechte Spalte der Kandidaten-Detailseite -
// war früher der separate "Verlauf"-Tab (history-tab.tsx), ist jetzt eine eigene Karte
// wie ContactChips/NoteSection etc. Nur "note"-Einträge sind löschbar (kleines
// Papierkorb-Icon + Inline-Bestätigung, gleiches Muster wie contacts-section.tsx) -
// automatische Einträge wie status_change bleiben als unveränderliches Prüfprotokoll
// erhalten, siehe deleteNoteAction in actions.ts.
export function HistorySection({
  candidateId,
  history,
  leadtableDescription,
  weitereAntworten,
  team = [],
  tasks = [],
  onOpenTask,
  currentUserId,
}: {
  candidateId: string
  history: HistoryEntry[]
  leadtableDescription?: string | null
  weitereAntworten?: string | null
  team?: HistoryPerson[]
  tasks?: HistoryTask[]
  onOpenTask?: (taskId: string) => void
  currentUserId?: string
}) {
  const router = useRouter()
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const [notePending, startNoteTransition] = useTransition()
  const [noteError, setNoteError] = useState<string | null>(null)
  const [noteInfo, setNoteInfo] = useState<string | null>(null)
  // "@" bzw. "#" vor dem Cursor öffnet Vorschläge: Kollegen bzw. offene Aufgaben.
  const [ref, setRef] = useState<{ trigger: "@" | "#"; query: string } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const field = useRef<HTMLTextAreaElement | null>(null)
  const names = useMemo(() => team.map((p) => p.full_name ?? "").filter(Boolean), [team])

  const suggestions: Suggestion[] = useMemo(() => {
    if (!ref) return []
    const q = ref.query.trimStart().toLowerCase()
    if (ref.trigger === "@") {
      return names.filter((n) => n.toLowerCase().includes(q)).slice(0, 6).map((n) => ({ key: n, insert: n, label: `@${n}` }))
    }
    return tasks
      .filter((t) => t.status !== "erledigt" && t.title.toLowerCase().includes(q))
      .slice(0, 6)
      .map((t) => ({ key: t.id, insert: t.title, label: t.title, hint: t.assigneeName }))
  }, [ref, names, tasks])

  const mentioned = splitReferences(note, names, tasks.map((t) => t.title))
  const notifyNames = [
    ...new Set([
      ...mentioned.filter((p) => p.type === "mention").map((p) => p.value),
      ...mentioned.filter((p) => p.type === "task").map((p) => tasks.find((t) => t.title === p.value)?.assigneeName ?? ""),
    ]),
  ].filter((n) => n && n !== team.find((p) => p.id === currentUserId)?.full_name)

  function trackCaret(el: HTMLTextAreaElement) {
    field.current = el
    setRef(referenceQueryAt(el.value, el.selectionStart ?? el.value.length))
    setActiveIndex(0)
  }

  function insertReference(s: Suggestion) {
    const el = field.current
    if (!el || !ref) return
    const caret = el.selectionStart ?? note.length
    const start = caret - ref.query.length - 1
    const next = `${note.slice(0, start)}${ref.trigger}${s.insert} ${note.slice(caret)}`
    const pos = start + s.insert.length + 2
    setNote(next)
    setRef(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(pos, pos)
    })
  }

  function handleAddNote() {
    const text = note.trim()
    if (!text || notePending) return
    setNoteError(null)
    startNoteTransition(async () => {
      const result = await addNoteAction(candidateId, text)
      if (result?.error) {
        setNoteError(result.error)
        return
      }
      setNote("")
      setNoteInfo(notifyNames.length ? `Benachrichtigt: ${notifyNames.join(", ")}` : null)
      router.refresh()
    })
  }

  function handleDelete(entryId: string) {
    setDeleteError(null)
    startDeleteTransition(async () => {
      const result = await deleteNoteAction(entryId)
      if (result?.error) {
        setDeleteError(result.error)
        return
      }
      setDeleteConfirmId(null)
      router.refresh()
    })
  }

  const hasDescription = typeof leadtableDescription === "string" && leadtableDescription.trim() !== ""
  const hasWeitereAntworten = typeof weitereAntworten === "string" && weitereAntworten.trim() !== ""
  const isEmpty = history.length === 0 && !hasDescription && !hasWeitereAntworten

  const groups: { key: string; label: string; entries: HistoryEntry[] }[] = []
  for (const entry of history) {
    const key = dateKey(entry.created_at)
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.key === key) {
      lastGroup.entries.push(entry)
    } else {
      groups.push({ key, label: formatGroupLabel(entry.created_at), entries: [entry] })
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-sm font-semibold text-gray-700">Verlauf ({history.length})</p>

      {/* Eigene Notiz bzw. kurzer Stand, intern (Paket 77). */}
      <div className="mb-4 flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea", backgroundColor: "#f8fafc" }}>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_NOTES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setNote((current) => (current.trim() ? `${current.trim()} · ${q}` : q))}
              className="rounded-full border bg-white px-2.5 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
              style={{ borderColor: "#dde3ea" }}
            >
              {q}
            </button>
          ))}
        </div>
        <div className="relative">
          <AutoTextarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              setNoteInfo(null)
              trackCaret(e.currentTarget)
            }}
            onClick={(e) => trackCaret(e.currentTarget)}
            onKeyDown={(e) => {
              if (suggestions.length > 0) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault()
                  setActiveIndex((i) => (i + (e.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length)
                  return
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault()
                  insertReference(suggestions[Math.min(activeIndex, suggestions.length - 1)])
                  return
                }
                if (e.key === "Escape") {
                  setRef(null)
                  return
                }
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                handleAddNote()
              }
            }}
            onBlur={() => setTimeout(() => setRef(null), 150)}
            placeholder="Notiz oder kurzer Stand … Kollegen mit @Name erwähnen, Aufgaben mit # verknüpfen"
            className="min-h-9 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: "#dde3ea" }}
            disabled={notePending}
          />
          {suggestions.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-md border bg-white py-1 text-sm shadow-lg" style={{ borderColor: "#dde3ea" }}>
              <li className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">{ref?.trigger === "@" ? "Kollegen erwähnen" : "Offene Aufgabe verknüpfen"}</li>
              {suggestions.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      insertReference(s)
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-50"
                    style={i === activeIndex ? { backgroundColor: "#f0f4f8" } : undefined}
                  >
                    <span className="min-w-0 truncate">{s.label}</span>
                    {s.hint && <span className="shrink-0 text-xs text-gray-400">{s.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ref?.trigger === "#" && suggestions.length === 0 && !tasks.some((t) => t.status !== "erledigt") && (
            <p className="mt-1 text-xs text-gray-400">Keine offenen Aufgaben bei diesem Kandidaten.</p>
          )}
        </div>
        {noteError && <p className="text-xs text-red-600">{noteError}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-400">
            {notifyNames.length ? `Benachrichtigt: ${notifyNames.join(", ")}` : noteInfo ?? "Nur intern sichtbar · @ erwähnt, # verknüpft Aufgaben · Strg/Cmd + Enter"}
          </span>
          <button
            type="button"
            onClick={handleAddNote}
            disabled={notePending || !note.trim()}
            className="rounded-md px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {notePending ? "Speichert…" : "Notiz hinzufügen"}
          </button>
        </div>
      </div>

      {isEmpty ? (
        <p className="text-sm text-gray-400">Noch keine Aktivität</p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasDescription && <CollapsibleTextBlock title="Leadtable-Notizen (importiert)" text={leadtableDescription!} />}
          {hasWeitereAntworten && (
            <CollapsibleTextBlock title="Weitere Formularangaben" text={weitereAntworten!} />
          )}

          {deleteError && <p className="text-xs text-red-600">Löschen fehlgeschlagen: {deleteError}</p>}

          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
              <ol className="flex flex-col gap-3">
                {group.entries.map((entry) => {
                  const Icon = TYPE_ICON[entry.type ?? ""] ?? Circle
                  const colors = TYPE_COLOR[entry.type ?? ""] ?? FALLBACK_COLOR
                  const isNote = entry.type === "note"
                  return (
                    <li key={entry.id} className="flex gap-3">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.bg }}
                      >
                        <Icon size={14} style={{ color: colors.text }} />
                      </div>
                      <div
                        className="flex flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2"
                        style={{ borderColor: "#dde3ea" }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-400">{formatEntryTime(entry.created_at)}</span>
                          <div className="flex items-center gap-2">
                            {entry.createdByName && (
                              <span className="text-xs text-gray-400">{entry.createdByName}</span>
                            )}
                            {isNote && (
                              deleteConfirmId === entry.id ? (
                                <span className="flex items-center gap-1">
                                  <span className="text-xs text-gray-500">Löschen?</span>
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    disabled={deletePending}
                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                                    style={{ backgroundColor: "#dc2626" }}
                                  >
                                    Ja
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    disabled={deletePending}
                                    className="rounded border px-1.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                                    style={{ borderColor: "#dde3ea" }}
                                  >
                                    Nein
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(entry.id)}
                                  className="rounded p-0.5 text-gray-300 hover:text-red-500 hover:bg-red-50"
                                  aria-label="Notiz löschen"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )
                            )}
                          </div>
                        </div>
                        {entry.content &&
                          (isNote ? (
                            <NoteText text={entry.content} names={names} tasks={tasks} onOpenTask={onOpenTask} />
                          ) : (
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
                          ))}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
