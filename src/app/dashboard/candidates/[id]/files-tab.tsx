"use client"

import { useRef, useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { uploadFileAction, deleteFileAction } from "./actions"

interface FileItem {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  created_at: string
  signedUrl: string | null
}

interface FilesTabProps {
  candidateId: string
  files: FileItem[]
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function FilesTab({ candidateId, files }: FilesTabProps) {
  const router = useRouter()
  const [uploadPending, startUpload] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError(null)
    const fd = new FormData()
    fd.append("file", file)

    startUpload(async () => {
      const result = await uploadFileAction(candidateId, fd)
      if (result?.error) {
        setUploadError(result.error)
      } else {
        router.refresh()
      }
    })

    if (inputRef.current) inputRef.current.value = ""
  }

  function handleDelete(fileId: string, storagePath: string) {
    setDeleteError(null)
    startDelete(async () => {
      const result = await deleteFileAction(fileId, storagePath, candidateId)
      if (result?.error) {
        setDeleteError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Dateien
        </span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadPending}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {uploadPending ? "Wird hochgeladen…" : "Datei hochladen"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {uploadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Upload fehlgeschlagen: {uploadError}
        </p>
      )}
      {deleteError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          Löschen fehlgeschlagen: {deleteError}
        </p>
      )}

      {files.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Dateien hochgeladen.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
              style={{ borderColor: "#dde3ea" }}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                {f.signedUrl ? (
                  <a
                    href={f.signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-sm font-medium hover:underline"
                    style={{ color: "#1e56a0" }}
                  >
                    {f.name}
                  </a>
                ) : (
                  <span className="truncate text-sm font-medium text-gray-700">
                    {f.name}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {formatSize(f.size)} &middot;{" "}
                  {new Date(f.created_at).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </div>
              <button
                onClick={() => handleDelete(f.id, f.storage_path)}
                disabled={deletePending}
                className="ml-4 shrink-0 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Datei löschen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
