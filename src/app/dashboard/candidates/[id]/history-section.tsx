"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowRightLeft, StickyNote, Circle, Trash2 } from "lucide-react"
import { deleteNoteAction } from "./actions"

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
}

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  status_change: { bg: "#1e56a018", text: "#1e56a0" },
  note: { bg: "#9ca3af18", text: "#6b7280" },
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
  history,
  leadtableDescription,
  weitereAntworten,
}: {
  history: HistoryEntry[]
  leadtableDescription?: string | null
  weitereAntworten?: string | null
}) {
  const router = useRouter()
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

      {isEmpty ? (
        <p className="text-sm text-gray-400">Noch keine Aktivität</p>
      ) : (
        <div className="flex flex-col gap-6">
          {hasDescription && <CollapsibleTextBlock title="Leadtable-Notizen (importiert)" text={leadtableDescription!} />}
          {hasWeitereAntworten && (
            <CollapsibleTextBlock title="Weitere Leadtable-Antworten" text={weitereAntworten!} />
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
                        {entry.content && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.content}</p>
                        )}
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
