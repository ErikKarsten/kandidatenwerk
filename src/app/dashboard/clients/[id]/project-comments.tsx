"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Paperclip, Pencil, Trash2 } from "lucide-react"
import { COMMENT_KINDS } from "@/lib/client-project"
import { addCommentAction, deleteCommentAction, getCommentFileUrlAction, updateCommentAction } from "./project-actions"

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
  const [kind, setKind] = useState("notiz")
  const [mentions, setMentions] = useState<string[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)
  const colleagues = team.filter((t) => t.id !== currentUserId)

  function addMention(id: string) {
    const person = team.find((t) => t.id === id)
    if (!person || mentions.includes(id)) return
    setMentions([...mentions, id])
    setContent((c) => `${c}${c && !c.endsWith(" ") ? " " : ""}@${person.full_name ?? "Kollege"} `)
  }

  function handleSubmit() {
    setError(null)
    const fd = new FormData()
    fd.append("content", content)
    fd.append("kind", kind)
    fd.append("mentions", JSON.stringify(mentions))
    for (const f of files) fd.append("files", f)
    startTransition(async () => {
      const result = await addCommentAction(clientId, fd)
      if (result?.error) return setError(result.error)
      setContent("")
      setKind("notiz")
      setMentions([])
      setFiles([])
      if (fileInput.current) fileInput.current.value = ""
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <h3 className="text-sm font-semibold text-gray-900">Kommentare</h3>

      <div className="flex flex-col gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Kommentar schreiben, z.B. Ergebnis eines Termins…"
          className="w-full rounded-md border px-3 py-2 text-sm"
          style={{ borderColor: "#dde3ea" }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }} aria-label="Art">
            {COMMENT_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <select
            value=""
            onChange={(e) => addMention(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs"
            style={{ borderColor: "#dde3ea" }}
            aria-label="Kollegen erwähnen"
          >
            <option value="">@ Erwähnen…</option>
            {colleagues.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? "Ohne Namen"}
              </option>
            ))}
          </select>
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
          <CommentItem key={c.id} clientId={clientId} comment={c} canEdit={c.kind !== "system" && (c.authorId === currentUserId || isAdmin)} />
        ))}
      </div>
    </div>
  )
}

function CommentItem({ clientId, comment, canEdit }: { clientId: string; comment: ProjectComment; canEdit: boolean }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(comment.content)
  const [kind, setKind] = useState(comment.kind)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const style = KIND_STYLE[comment.kind] ?? KIND_STYLE.notiz

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateCommentAction(clientId, comment.id, text, kind)
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
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
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
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-md border px-2 py-1 text-xs" style={{ borderColor: "#dde3ea" }}>
              {COMMENT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
            <button type="button" onClick={save} disabled={pending} className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
              Speichern
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <p className={`whitespace-pre-wrap text-sm ${comment.kind === "system" ? "italic text-gray-500" : "text-gray-700"}`}>{comment.content}</p>
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
    </div>
  )
}
