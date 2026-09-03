"use client"

import { useTransition, useState } from "react"
import { useRouter } from "next/navigation"
import { uploadClientFileAction, deleteClientFileAction } from "./actions"
import { FileDropZone } from "@/components/ui/file-drop-zone"

export interface ClientFileItem {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  created_at: string
  signedUrl: string | null
}

interface ClientFilesTabProps {
  clientId: string
  files: ClientFileItem[]
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Exaktes Muster wie candidates/[id]/files-tab.tsx - nur candidateId/uploadFileAction/
// deleteFileAction durch clientId/uploadClientFileAction/deleteClientFileAction ersetzt.
export function ClientFilesTab({ clientId, files }: ClientFilesTabProps) {
  const router = useRouter()
  const [uploadPending, startUpload] = useTransition()
  const [deletePending, startDelete] = useTransition()
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleUpload(file: File) {
    setUploadError(null)
    const fd = new FormData()
    fd.append("file", file)

    startUpload(async () => {
      const result = await uploadClientFileAction(clientId, fd)
      if (result?.error) {
        setUploadError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  function handleDelete(fileId: string, storagePath: string) {
    setDeleteError(null)
    startDelete(async () => {
      const result = await deleteClientFileAction(fileId, storagePath, clientId)
      if (result?.error) {
        setDeleteError(result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <FileDropZone
        onUpload={handleUpload}
        disabled={uploadPending}
        label={uploadPending ? "Wird hochgeladen…" : "Datei hierher ziehen oder klicken zum Hochladen"}
      />

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
