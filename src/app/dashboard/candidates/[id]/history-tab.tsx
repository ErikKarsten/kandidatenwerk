import { ArrowRightLeft, StickyNote, Circle } from "lucide-react"

export interface HistoryTabEntry {
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

export function HistoryTab({ history }: { history: HistoryTabEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-gray-400">Noch keine Aktivität</p>
  }

  const groups: { key: string; label: string; entries: HistoryTabEntry[] }[] = []
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
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{group.label}</p>
          <ol className="flex flex-col gap-3">
            {group.entries.map((entry) => {
              const Icon = TYPE_ICON[entry.type ?? ""] ?? Circle
              const colors = TYPE_COLOR[entry.type ?? ""] ?? FALLBACK_COLOR
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
                      {entry.createdByName && (
                        <span className="text-xs text-gray-400">{entry.createdByName}</span>
                      )}
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
  )
}
