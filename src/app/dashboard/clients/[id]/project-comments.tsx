"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ListPlus, Paperclip, Pencil, Trash2 } from "lucide-react"
import { addCommentAction, deleteCommentAction, getCommentFileUrlAction, updateCommentAction } from "./project-actions"
import { TaskFormModal } from "@/components/dashboard/task-form-modal"
import { parseCommentLines, splitLinks, taskTitleFromLine } from "@/lib/comment-text"

export interface ProjectComment {
  id: string
  authorId: string | null
  authorName: string
  kind: string
  content: string
  createdAt: string
  editedAt: string | null
  files: { id: string; name: string; path: string }[]
}

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  notiz: { label: "Notiz", color: "#6b7280" },
  termin: { label: "Termin", color: "#1e56a0" },
  telefonat: { label: "Telefonat", color: "#1a9a6a" },
  email: { label: "E-Mail", color: "#8b5cf6" },
  gespraech: { label: "Gespräch (Close)", color: "#d97706" },
  system: { label: "System", color: "#9ca3af" },
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

// Kommentare im Projekt-Reiter (Paket 9): mit Art, Anhängen und @Erwähnung (Mail an
// die erwähnte Person). Eigene Kommentare bearbeiten/löschen, Admins alle.
export function ProjectComments({
  clientId,
  comments,
  team,
  currentUserId,
  isAdmin,
}: {
  clientId: string
  comments: ProjectComment[]
  team: { id: string; full_name: string | null }[]
  currentUserId: string
  isAdmin: boolean
}) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const colleagues = team.filter((t) => t.id !== currentUserId && t.full_name)
  // Erwähnt ist, wessen "@Vorname Nachname" im Text steht.
  const mentions = colleagues.filter((t) => content.includes(`@${t.full_name}`)).map((t) => t.id)
  const suggestions =
    mentionQuery === null ? [] : colleagues.filter((t) => t.full_name!.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)

  // "@" + Buchstaben direkt vor dem Cursor öffnet die Vorschlagsliste.
  function handleChange(value: string, caret: number) {
    setContent(value)
    const match = value.slice(0, caret).match(/(?:^|\s)@([\p{L}.-]*)$/u)
    setMentionQuery(match ? match[1] : null)
  }

  function insertMention(name: string) {
    const el = textarea.current
    const caret = el?.selectionStart ?? content.length
    const before = content.slice(0, caret).replace(/@([\p{L}.-]*)$/u, `@${name} `)
    const next = before + content.slice(caret)
    setContent(next)
    setMentionQuery(null)
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(before.length, before.length)
    })
  }

  function handleSubmit() {
    setError(null)
    const fd = new FormData()
    fd.append("content", content)
    fd.append("kind", "notiz")
    fd.append("mentions", JSON.stringify(mentions))
    for (const f of files) fd.append("files", f)
    startTransition(async () => {
      const result = await addCommentAction(clientId, fd)
      if (result?.error) return setError(result.error)
      setContent("")
      setFiles([])
      if (fileInput.current) fileInput.current.value = ""
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <h3 className="text-sm font-semibold text-gray-900">Kommentare</h3>

      <div className="relative flex flex-col gap-2">
        <textarea
          ref={textarea}
          value={content}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
          onKeyDown={(e) => {
            if (suggestions.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
              e.preventDefault()
              insertMention(suggestions[0].full_name!)
            } else if (e.key === "Escape") setMentionQuery(null)
          }}
          onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
          rows={3}
          placeholder="Kommentar schreiben … Kollegen mit @Name erwähnen"
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "#dde3ea" }}
        />
        {suggestions.length > 0 && (
          <ul className="absolute left-2 top-full z-10 -mt-1 w-56 overflow-hidden rounded-md border bg-white text-sm shadow-lg" style={{ borderColor: "#dde3ea" }}>
            {suggestions.map((t) => (
              <li key={t.id}>
                <button type="button" onMouseDown={(e) => (e.preventDefault(), insertMention(t.full_name!))} className="w-full px-3 py-1.5 text-left hover:bg-gray-50">
                  @{t.full_name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
            <Paperclip size={13} />
            {files.length > 0 ? `${files.length} Datei${files.length === 1 ? "" : "en"}` : "Anhang"}
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || (!content.trim() && files.length === 0)}
            className="ml-auto rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {pending ? "Speichert…" : "Kommentieren"}
          </button>
        </div>
        {mentions.length > 0 && (
          <p className="text-xs text-gray-500">
            Benachrichtigt per Mail: {mentions.map((id) => team.find((t) => t.id === id)?.full_name ?? "?").join(", ")}
          </p>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: "#eef2f6" }}>
        {comments.length === 0 && <p className="text-sm text-gray-400">Noch keine Kommentare.</p>}
        {comments.map((c) => (
          <CommentItem
            key={c.id}
            clientId={clientId}
            comment={c}
            canEdit={c.kind !== "system" && (c.authorId === currentUserId || isAdmin)}
            team={team}
            currentUserId={currentUserId}
          />
        ))}
      </div>
    </div>
  )
}

function CommentItem({
  clientId,
  comment,
  canEdit,
  team,
  currentUserId,
}: {
  clientId: string
  comment: ProjectComment
  canEdit: boolean
  team: { id: string; full_name: string | null }[]
  currentUserId: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.content)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const style = KIND_STYLE[comment.kind] ?? KIND_STYLE.notiz
  // Aufgabe aus einem Punkt der Gesprächszusammenfassung (Paket 30, T-120).
  const [taskFrom, setTaskFrom] = useState<string | null>(null)

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateCommentAction(clientId, comment.id, text, comment.kind === "system" ? "notiz" : comment.kind)
      if (result?.error) return setError(result.error)
      setEditing(false)
      router.refresh()
    })
  }

  function remove() {
    if (!confirm("Kommentar wirklich löschen?")) return
    startTransition(async () => {
      const result = await deleteCommentAction(clientId, comment.id)
      if (result?.error) return setError(result.error)
      router.refresh()
    })
  }

  async function openFile(path: string) {
    const result = await getCommentFileUrlAction(path)
    if ("url" in result) window.open(result.url, "_blank", "noopener")
    else setError(result.error)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-gray-900">{comment.authorName}</span>
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${style.color}18`, color: style.color }}>
          {style.label}
        </span>
        <span className="text-gray-400">
          {formatTime(comment.createdAt)}
          {comment.editedAt ? " · bearbeitet" : ""}
        </span>
        {canEdit && !editing && (
          <span className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => setEditing(true)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Bearbeiten">
              <Pencil size={12} />
            </button>
            <button type="button" onClick={remove} disabled={pending} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600" aria-label="Löschen">
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="w-full rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: "#dde3ea" }} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending} className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
              Speichern
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <CommentBody comment={comment} onCreateTask={setTaskFrom} />
      )}
      {comment.files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {comment.files.map((f) => (
            <button key={f.id} type="button" onClick={() => openFile(f.path)} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-gray-50" style={{ borderColor: "#dde3ea", color: "#1e56a0" }}>
              <Paperclip size={11} /> {f.name}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {taskFrom && (
        <TaskFormModal
          profiles={team}
          clientId={clientId}
          onClose={() => setTaskFrom(null)}
          initial={{
            title: taskTitleFromLine(taskFrom),
            description: `Aus ${comment.kind === "gespraech" ? "dem Gespräch" : "dem Kommentar"} vom ${formatTime(comment.createdAt)}:\n${taskFrom.replace(/^\s*[-•*]\s+/, "").trim()}`,
            assignedTo: team.some((t) => t.id === currentUserId) ? currentUserId : "",
          }}
        />
      )}
    </div>
  )
}

// Kommentartext mit klickbaren, umbrechenden Links. Bei Gesprächszusammenfassungen hat
// jeder Punkt unter "Vereinbart / nächste Schritte" und "Offene Fragen" einen Knopf
// "Aufgabe" (Paket 30, T-119/T-120).
function CommentBody({ comment, onCreateTask }: { comment: ProjectComment; onCreateTask: (line: string) => void }) {
  const lines = parseCommentLines(comment.content, comment.kind === "gespraech")
  return (
    <div className={`min-w-0 text-sm [overflow-wrap:anywhere] ${comment.kind === "system" ? "italic text-gray-500" : "text-gray-700"}`}>
      {lines.map((line, i) =>
        line.text.trim() === "" ? (
          <div key={i} className="h-2" />
        ) : (
          <div key={i} className="group flex items-start gap-2">
            <p className="min-w-0 flex-1 whitespace-pre-wrap">
              {splitLinks(line.text).map((part, j) =>
                part.type === "link" ? (
                  <a key={j} href={part.value} target="_blank" rel="noopener noreferrer" className="break-all hover:underline" style={{ color: "#1e56a0" }}>
                    {part.value}
                  </a>
                ) : (
                  <span key={j}>{part.value}</span>
                )
              )}
            </p>
            {line.actionable && (
              <button
                type="button"
                onClick={() => onCreateTask(line.text)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                style={{ borderColor: "#dde3ea" }}
                title="Als Aufgabe anlegen"
              >
                <ListPlus size={12} /> Aufgabe
              </button>
            )}
          </div>
        )
      )}
    </div>
  )
}
