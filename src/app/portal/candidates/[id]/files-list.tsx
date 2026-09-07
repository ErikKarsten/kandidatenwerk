import { FileText } from "lucide-react"

export interface PortalFile {
  id: string
  name: string
  size: number | null
  mime_type: string | null
  created_at: string
  signedUrl: string | null
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Bewusst reine Anzeige, kein Upload/Löschen - der Kunde darf laut Spezifikation nur
// lesen, das Verwalten der Dateien bleibt Sache des Teams im internen Dashboard.
export function PortalFilesList({ files }: { files: PortalFile[] }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Dateien ({files.length})
      </span>
      <ul className="flex flex-col gap-2">
        {files.map((f) => (
          <li
            key={f.id}
            className="flex items-center gap-3 rounded-lg border px-4 py-3"
            style={{ borderColor: "#dde3ea" }}
          >
            <FileText size={16} className="shrink-0 text-gray-400" />
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
                <span className="truncate text-sm font-medium text-gray-700">{f.name}</span>
              )}
              <span className="text-xs text-gray-400">
                {formatSize(f.size)} ·{" "}
                {new Date(f.created_at).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
