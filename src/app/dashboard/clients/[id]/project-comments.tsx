"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, ListPlus, MessageSquare, Paperclip, Pencil, SmilePlus, ThumbsUp, Trash2 } from "lucide-react"
import { addCommentAction, deleteCommentAction, getCommentFileUrlAction, toggleCommentReactionAction, updateCommentAction } from "./project-actions"
import { TaskFormModal } from "@/components/dashboard/task-form-modal"
import { parseCommentLines, splitLinks, splitMentions, taskTitleFromLine } from "@/lib/comment-text"

export interface ProjectComment {
  id: string
  authorId: string | null
  authorName: string
  kind: string
  content: string
  createdAt: string
  editedAt: string | null
  // Antwort auf diesen Kommentar (Paket 50); null = oberster Kommentar.
  parentId: string | null
  reactions: { emoji: string; userId: string }[]
  files: { id: string; name: string; path: string }[]
}

type TeamMember = { id: string; full_name: string | null }

const KIND_STYLE: Record<string, { label: string; color: string }> = {
  notiz: { label: "Notiz", color: "#6366f1" },
  termin: { label: "Termin", color: "#1e56a0" },
  telefonat: { label: "Telefonat", color: "#1a9a6a" },
  email: { label: "E-Mail", color: "#8b5cf6" },
  gespraech: { label: "Gespräch (Close)", color: "#d97706" },
  system: { label: "System", color: "#9ca3af" },
}

const EMOJIS = ["👍", "❤️", "🎉", "👀", "✅"]
const AVATAR_COLORS = ["#1e56a0", "#7c3aed", "#0e7490", "#b45309", "#be185d", "#15803d", "#4338ca"]

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?"
}

function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const color = AVATAR_COLORS[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: color }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

// Kommentare im Projekt-Reiter (Paket 9, überarbeitet in Paket 50): jeder Kommentar als
// eigene Karte mit hervorgehobenen @Erwähnungen, Reaktionen und ein-/ausklappbaren Antworten.
export function ProjectComments({
  clientId,
  comments,
  team,
  currentUserId,
  isAdmin,
}: {
  clientId: string
  comments: ProjectComment[]
  team: TeamMember[]
  currentUserId: string
  isAdmin: boolean
}) {
  const topLevel = comments.filter((c) => !c.parentId)
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <h3 className="text-sm font-semibold text-gray-900">Kommentare</h3>
      <CommentComposer clientId={clientId} team={team} currentUserId={currentUserId} allowFiles />
      <div className="flex flex-col gap-3 border-t pt-3" style={{ borderColor: "#eef2f6" }}>
        {topLevel.length === 0 && <p className="text-sm text-gray-400">Noch keine Kommentare.</p>}
        {topLevel.map((c) => (
          <CommentThread key={c.id} clientId={clientId} comment={c} replies={repliesOf(c.id)} team={team} currentUserId={currentUserId} isAdmin={isAdmin} />
        ))}
      </div>
    </div>
  )
}

// Eingabe mit @Erwähnung (Mail an die erwähnte Person) - für neue Kommentare und Antworten.
function CommentComposer({
  clientId,
  team,
  currentUserId,
  parentId,
  allowFiles = false,
  autoFocus = false,
  onDone,
}: {
  clientId: string
  team: TeamMember[]
  currentUserId: string
  parentId?: string
  allowFiles?: boolean
  autoFocus?: boolean
  onDone?: () => void
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
    if (parentId) fd.append("parent_id", parentId)
    for (const f of files) fd.append("files", f)
    startTransition(async () => {
      const result = await addCommentAction(clientId, fd)
      if (result?.error) return setError(result.error)
      setContent("")
      setFiles([])
      if (fileInput.current) fileInput.current.value = ""
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="relative flex flex-col gap-2">
      <textarea
        ref={textarea}
        value={content}
        autoFocus={autoFocus}
        onChange={(e) => handleChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (suggestions.length > 0 && (e.key === "Enter" || e.key === "Tab")) {
            e.preventDefault()
            insertMention(suggestions[0].full_name!)
          } else if (e.key === "Escape") setMentionQuery(null)
        }}
        onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
        rows={parentId ? 2 : 3}
        placeholder={parentId ? "Antworten … Kollegen mit @Name erwähnen" : "Kommentar schreiben … Kollegen mit @Name erwähnen"}
        className="w-full rounded-md border bg-white px-3 py-2 text-sm"
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
        {allowFiles && (
          <label className="inline-flex cursor-pointer items-center gap-1 text-xs text-gray-600 hover:text-gray-900">
            <Paperclip size={13} />
            {files.length > 0 ? `${files.length} Datei${files.length === 1 ? "" : "en"}` : "Anhang"}
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </label>
        )}
        {mentions.length > 0 && (
          <span className="text-xs text-gray-500">Benachrichtigt: {mentions.map((id) => team.find((t) => t.id === id)?.full_name ?? "?").join(", ")}</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {onDone && (
            <button type="button" onClick={onDone} className="text-xs text-gray-500 hover:underline">
              Abbrechen
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || (!content.trim() && files.length === 0)}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {pending ? "Speichert…" : parentId ? "Antworten" : "Kommentieren"}
          </button>
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Ein oberster Kommentar als Karte mit Reaktionen und Antworten.
function CommentThread({
  clientId,
  comment,
  replies,
  team,
  currentUserId,
  isAdmin,
}: {
  clientId: string
  comment: ProjectComment
  replies: ProjectComment[]
  team: TeamMember[]
  currentUserId: string
  isAdmin: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [replying, setReplying] = useState(false)
  const style = KIND_STYLE[comment.kind] ?? KIND_STYLE.notiz
  const replyAuthors = [...new Set(replies.map((r) => r.authorName))]

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm" style={{ borderColor: "#e5e7eb", borderLeft: `3px solid ${style.color}` }}>
      <div className="p-3">
        <CommentItem clientId={clientId} comment={comment} canEdit={comment.kind !== "system" && (comment.authorId === currentUserId || isAdmin)} team={team} currentUserId={currentUserId} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-1.5" style={{ borderColor: "#f1f5f9" }}>
        <Reactions clientId={clientId} comment={comment} team={team} currentUserId={currentUserId} />
        <span className="ml-auto flex items-center gap-3">
          {replies.length > 0 && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {replies.length} {replies.length === 1 ? "Antwort" : "Antworten"}
              <span className="flex -space-x-1.5">
                {replyAuthors.slice(0, 3).map((n) => (
                  <Avatar key={n} name={n} size={18} />
                ))}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setReplying(true)
              setExpanded(true)
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            <MessageSquare size={13} /> Antworten
          </button>
        </span>
      </div>
      {expanded && (replies.length > 0 || replying) && (
        <div className="flex flex-col gap-2 border-t px-3 py-2.5" style={{ borderColor: "#f1f5f9", backgroundColor: "#f8fafc" }}>
          {replies.map((r) => (
            <div key={r.id} className="rounded-md border bg-white" style={{ borderColor: "#e5e7eb" }}>
              <div className="p-2.5">
                <CommentItem clientId={clientId} comment={r} canEdit={r.authorId === currentUserId || isAdmin} team={team} currentUserId={currentUserId} compact />
              </div>
              <div className="border-t px-2.5 py-1" style={{ borderColor: "#f1f5f9" }}>
                <Reactions clientId={clientId} comment={r} team={team} currentUserId={currentUserId} />
              </div>
            </div>
          ))}
          {replying ? (
            <CommentComposer clientId={clientId} team={team} currentUserId={currentUserId} parentId={comment.id} autoFocus onDone={() => setReplying(false)} />
          ) : (
            <button type="button" onClick={() => setReplying(true)} className="w-fit text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
              Antworten
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Reaktionen: vorhandene als Chips (eigene hervorgehoben), Daumen per Klick, weitere über
// die Auswahl.
function Reactions({ clientId, comment, team, currentUserId }: { clientId: string; comment: ProjectComment; team: TeamMember[]; currentUserId: string }) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const nameOf = (id: string) => team.find((t) => t.id === id)?.full_name ?? "Unbekannt"
  const grouped = EMOJIS.map((emoji) => ({ emoji, users: comment.reactions.filter((r) => r.emoji === emoji).map((r) => r.userId) })).filter((g) => g.users.length > 0)
  const hasThumb = grouped.some((g) => g.emoji === "👍")

  function toggle(emoji: string) {
    setPickerOpen(false)
    startTransition(async () => {
      await toggleCommentReactionAction(clientId, comment.id, emoji)
      router.refresh()
    })
  }

  return (
    <span className="relative flex flex-wrap items-center gap-1.5">
      {grouped.map((g) => {
        const mine = g.users.includes(currentUserId)
        return (
          <button
            key={g.emoji}
            type="button"
            disabled={pending}
            onClick={() => toggle(g.emoji)}
            title={g.users.map(nameOf).join(", ")}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs disabled:opacity-60"
            style={mine ? { borderColor: "#a5b4fc", backgroundColor: "#eef2ff", color: "#3730a3" } : { borderColor: "#e5e7eb", color: "#374151" }}
          >
            <span>{g.emoji}</span>
            <span className="font-medium">{g.users.length}</span>
          </button>
        )
      })}
      {!hasThumb && (
        <button type="button" disabled={pending} onClick={() => toggle("👍")} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Daumen hoch" title="Daumen hoch">
          <ThumbsUp size={14} />
        </button>
      )}
      <button type="button" onClick={() => setPickerOpen(!pickerOpen)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Reaktion hinzufügen" title="Reaktion hinzufügen">
        <SmilePlus size={14} />
      </button>
      {pickerOpen && (
        <span className="absolute left-0 top-full z-20 mt-1 flex gap-1 rounded-lg border bg-white p-1 shadow-lg" style={{ borderColor: "#e5e7eb" }}>
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => toggle(e)} className="rounded px-1.5 py-0.5 text-base hover:bg-gray-100">
              {e}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}

function CommentItem({
  clientId,
  comment,
  canEdit,
  team,
  currentUserId,
  compact = false,
}: {
  clientId: string
  comment: ProjectComment
  canEdit: boolean
  team: TeamMember[]
  currentUserId: string
  compact?: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.content)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const style = KIND_STYLE[comment.kind] ?? KIND_STYLE.notiz
  // Aufgabe aus einem Punkt der Gesprächszusammenfassung (Paket 30, T-120).
  const [taskFrom, setTaskFrom] = useState<string | null>(null)
  const names = team.map((t) => t.full_name).filter((n): n is string => !!n)

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
    <div className="group flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Avatar name={comment.authorName} size={compact ? 22 : 28} />
        <span className={`font-semibold text-gray-900 ${compact ? "text-xs" : "text-sm"}`}>{comment.authorName}</span>
        <span className="text-gray-400">
          {formatTime(comment.createdAt)}
          {comment.editedAt ? " · bearbeitet" : ""}
        </span>
        {comment.kind !== "notiz" && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${style.color}18`, color: style.color }}>
            {style.label}
          </span>
        )}
        {canEdit && !editing && (
          <span className="ml-auto flex items-center gap-1 opacity-60 group-hover:opacity-100">
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
        <CommentBody comment={comment} names={names} onCreateTask={setTaskFrom} />
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

// Kommentartext mit klickbaren, umbrechenden Links. Gespräche und Telefonate aus Close
// werden gegliedert (Paket 35): Titelzeile, Zwischenüberschriften (Kurzfazit, Besprochen,
// Vereinbart / nächste Schritte, Offene Fragen), Aufzählungen und "In Close ansehen" als
// Link. Punkte unter nächsten Schritten und offenen Fragen haben einen Knopf "Aufgabe".
function LinkedText({ text, names = [] }: { text: string; names?: string[] }) {
  return (
    <>
      {splitLinks(text).map((part, j) =>
        part.type === "link" ? (
          <a key={j} href={part.value} target="_blank" rel="noopener noreferrer" className="break-all hover:underline" style={{ color: "#1e56a0" }}>
            {part.value}
          </a>
        ) : (
          // @Erwähnungen hervorheben (Paket 50).
          splitMentions(part.value, names).map((m, k) =>
            m.type === "mention" ? (
              <span key={`${j}-${k}`} className="rounded px-1 font-medium" style={{ backgroundColor: "#ede9fe", color: "#6d28d9" }}>
                @{m.value}
              </span>
            ) : (
              <span key={`${j}-${k}`}>{m.value}</span>
            )
          )
        )
      )}
    </>
  )
}

function CommentBody({ comment, names, onCreateTask }: { comment: ProjectComment; names: string[]; onCreateTask: (line: string) => void }) {
  const structured = comment.kind === "gespraech" || comment.kind === "telefonat"
  const lines = parseCommentLines(comment.content, structured)
  return (
    <div className={`min-w-0 text-sm [overflow-wrap:anywhere] ${comment.kind === "system" ? "italic text-gray-500" : "text-gray-700"}`}>
      {lines.map((line, i) => {
        if (line.kind === "blank") return structured ? null : <div key={i} className="h-2" />
        if (line.kind === "title") return <p key={i} className="mb-1 text-[15px] font-semibold text-gray-900">{line.text}</p>
        if (line.kind === "heading")
          return (
            <div key={i} className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#1e56a0" }}>
                {line.text}
              </p>
              {line.rest && <p className="mt-0.5 whitespace-pre-wrap">{line.rest}</p>}
            </div>
          )
        if (line.kind === "link")
          return (
            <a key={i} href={line.text} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs hover:underline" style={{ color: "#1e56a0" }}>
              In Close ansehen ↗
            </a>
          )
        if (line.kind === "bullet")
          return (
            <div key={i} className="group mt-1 flex items-start gap-2">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
              <p className="min-w-0 flex-1 whitespace-pre-wrap">
                <LinkedText text={line.text} names={names} />
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
        return (
          <p key={i} className="whitespace-pre-wrap">
            <LinkedText text={line.text} names={names} />
          </p>
        )
      })}
    </div>
  )
}
