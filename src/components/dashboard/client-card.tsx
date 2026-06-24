import { Badge } from "@/components/ui/badge"

const STATUS_COLORS = {
  neu: { bar: "#4ba3c3", label: "Neu" },
  pruefung: { bar: "#f0c040", label: "In Prüfung" },
  interview: { bar: "#e07820", label: "Interview" },
  vorgestellt: { bar: "#8b5cf6", label: "Vorgestellt" },
  platziert: { bar: "#1a9a6a", label: "Platziert" },
  abgelehnt: { bar: "#d03030", label: "Abgelehnt" },
} as const

type StatusKey = keyof typeof STATUS_COLORS

export interface PipelineSegment {
  status: StatusKey
  count: number
}

export interface ClientCardProps {
  id: string
  name: string
  active: boolean
  tags: string[]
  stats: {
    kandidaten: number
    kampagnen: number
    platzierungen: number
  }
  pipeline: PipelineSegment[]
}

export function ClientCard({ name, active, tags, stats, pipeline }: ClientCardProps) {
  const total = pipeline.reduce((s, p) => s + p.count, 0)

  return (
    <div
      className="rounded-xl border bg-white flex flex-col overflow-hidden"
      style={{ borderColor: "#dde3ea" }}
    >
      <div className="flex flex-col gap-3 p-5 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: active ? "#1a9a6a" : "#9ca3af" }}
            />
            <h3 className="truncate font-semibold text-gray-900">{name}</h3>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: active ? "#1a9a6a18" : "#9ca3af18",
              color: active ? "#1a9a6a" : "#6b7280",
            }}
          >
            {active ? "Aktiv" : "Inaktiv"}
          </span>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Stat label="Kandidaten" value={stats.kandidaten} />
          <Stat label="Kampagnen" value={stats.kampagnen} />
          <Stat label="Platzierungen" value={stats.platzierungen} />
        </div>
      </div>

      {total > 0 && (
        <div>
          <div className="flex h-1.5 w-full overflow-hidden">
            {pipeline.map((seg) => {
              const { bar } = STATUS_COLORS[seg.status]
              const pct = (seg.count / total) * 100
              return (
                <div
                  key={seg.status}
                  title={`${STATUS_COLORS[seg.status].label}: ${seg.count}`}
                  style={{ width: `${pct}%`, backgroundColor: bar }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-5 py-2.5">
            {pipeline.map((seg) => {
              const { bar, label } = STATUS_COLORS[seg.status]
              return (
                <span key={seg.status} className="flex items-center gap-1 text-xs text-gray-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: bar }} />
                  {label} ({seg.count})
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center rounded-lg py-2" style={{ backgroundColor: "#f0f4f8" }}>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  )
}
