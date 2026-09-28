import { MessageSquareText } from "lucide-react"

export interface ClientNote {
  id: string
  content: string | null
  created_at: string
  clientName: string
}

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"]

function formatEntryTime(dateStr: string): string {
  const date = new Date(dateStr)
  const hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, "0")
  return `${date.getDate()}. ${MONTHS_SHORT[date.getMonth()]}, ${hours}:${minutes}`
}

// Eigener, klar abgegrenzter Bereich für die Notizen, die Kunden selbst im Portal zu
// einer Zuordnung hinterlegen (client_assignment_notes) - bewusst NICHT mit dem
// internen candidate_history-Verlauf (siehe history-section.tsx) vermischt, da diese
// beiden Kanäle unterschiedliche Herkunft/Sichtbarkeit haben. Rein lesend: eine
// Antwortfunktion von Staff-Seite ist bewusst (noch) nicht Teil dieser Ansicht.
export function ClientNotesSection({ notes }: { notes: ClientNote[] }) {
  if (notes.length === 0) return null

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-sm font-semibold text-gray-700">Notizen vom Kunden ({notes.length})</p>
      <ol className="flex flex-col gap-3">
        {notes.map((note) => (
          <li key={note.id} className="flex gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: "#1e56a018" }}
            >
              <MessageSquareText size={14} style={{ color: "#1e56a0" }} />
            </div>
            <div
              className="flex flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2"
              style={{ borderColor: "#dde3ea" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: "#1e56a0" }}>
                  {note.clientName}
                </span>
                <span className="text-xs text-gray-400">{formatEntryTime(note.created_at)}</span>
              </div>
              {note.content && (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
