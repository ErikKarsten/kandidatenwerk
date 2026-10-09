"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Settings } from "lucide-react"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export interface LeadCampaignTile {
  id: string
  title: string
  running: boolean
  berufsbild: string | null
  total: number
  unbearbeitet: number
  neu: number
  ueberfaellig: number
  statusCounts: Record<string, number>
  lastLeadAt: string | null
  // "Heute, 10:14" usw. - auf dem Server formatiert (Zeitzone Berlin).
  lastLeadLabel: string | null
  lastChangeLabel: string | null
  ks24: boolean
}

// "KS24 - Video Neele - Region …" -> "Video Neele - Region …" (Präfix ist bei allen gleich).
function displayTitle(title: string): string {
  return title.replace(/^\s*ks[\s-]?24\s*[-–|:]\s*/i, "")
}

function Badge({ count, label, color, bg, border }: { count: number; label: string; color: string; bg: string; border: string }) {
  if (count === 0) return null
  return (
    <span className="rounded-md border px-2 py-0.5 text-xs font-medium" style={{ color, backgroundColor: bg, borderColor: border }}>
      {count} {label}
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="rounded-full border bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-700" style={{ borderColor: "#eef2f6" }}>
        {children}
      </span>
    </div>
  )
}

// Kacheln je Lead-Kampagne im Stil von Leadtable (Paket 47). Klick zeigt die Kandidaten der
// Kampagne in "Alle Kandidaten" (Filter ?campaign=), das Zahnrad öffnet die Kampagne.
export function LeadCampaignTiles({ tiles }: { tiles: LeadCampaignTile[] }) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [onlyRunning, setOnlyRunning] = useState(false)
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return tiles.filter((t) => (!onlyRunning || t.running) && (!needle || t.title.toLowerCase().includes(needle)))
  }, [tiles, q, onlyRunning])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kampagne suchen…"
            className="w-full rounded-md border bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: "#dde3ea" }}
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={onlyRunning} onChange={(e) => setOnlyRunning(e.target.checked)} />
          Nur laufende
        </label>
        <span className="text-sm text-gray-500">{shown.length} Kampagnen</span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Kampagnen gefunden.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => {
            const open = () => router.push(`/dashboard/candidates?campaign=${t.id}`)
            const segments = CANDIDATE_STATUS_OPTIONS.map((o) => ({ ...o, count: t.statusCounts[o.value] ?? 0 })).filter((o) => o.count > 0)
            return (
              <div
                key={t.id}
                role="link"
                tabIndex={0}
                onClick={open}
                onKeyDown={(e) => {
                  if (e.key === "Enter") open()
                }}
                className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
                style={{ borderColor: "#dde3ea" }}
              >
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-gray-900" title={t.title}>
                    {!t.running && <span className="mr-1.5 align-middle text-xs font-medium text-gray-400">Pausiert ·</span>}
                    {displayTitle(t.title)}
                  </h3>
                  <Link
                    href={`/dashboard/campaigns/${t.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                    aria-label="Kampagne öffnen"
                    title="Kampagne öffnen"
                  >
                    <Settings size={18} />
                  </Link>
                </div>

                <div className="flex min-h-[1.5rem] flex-wrap gap-1.5">
                  <Badge count={t.ueberfaellig} label="überfällig" color="#dc2626" bg="#fef2f2" border="#fecaca" />
                  <Badge count={t.unbearbeitet} label="unbearbeitet" color="#2563eb" bg="#eff6ff" border="#bfdbfe" />
                  <Badge count={t.neu} label="neu" color="#16a34a" bg="#f0fdf4" border="#bbf7d0" />
                </div>

                <div className="flex flex-col gap-2">
                  <Row label="Leads gesamt">{t.total}</Row>
                  <Row label="Letzter Lead">{t.lastLeadLabel ?? "–"}</Row>
                  <Row label="Letzte Änderung">{t.lastChangeLabel ?? "–"}</Row>
                </div>

                {/* Verteilung der Status als Balken (Farben wie die Status-Plaketten). */}
                <div className="mt-1 flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" title={segments.map((s) => `${s.label}: ${s.count}`).join(" · ")}>
                  {segments.length === 0 ? (
                    <div className="h-full w-full rounded-full bg-gray-100" />
                  ) : (
                    segments.map((s) => <div key={s.value} className="h-full rounded-full" style={{ flexGrow: s.count, backgroundColor: s.dot }} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
