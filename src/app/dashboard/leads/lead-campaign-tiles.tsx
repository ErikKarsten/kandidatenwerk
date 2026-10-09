"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { useBerufsbilder } from "@/components/berufsbild-context"

export interface LeadCampaignTile {
  id: string
  title: string
  running: boolean
  berufsbild: string | null
  total: number
  neu: number
  vorqualifiziert: number
  lastLeadAt: string | null
  ks24: boolean
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
}

// Kacheln je Lead-Kampagne (Paket 46); Klick zeigt die Kandidaten der Kampagne in "Alle
// Kandidaten" (Filter ?campaign=).
export function LeadCampaignTiles({ tiles }: { tiles: LeadCampaignTile[] }) {
  const bb = useBerufsbilder()
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
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {shown.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/candidates?campaign=${t.id}`}
              className="flex flex-col gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
              style={{ borderColor: "#dde3ea" }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="min-w-0 text-sm font-semibold leading-snug text-gray-900 [overflow-wrap:anywhere]">{t.title}</h3>
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                  style={t.running ? { backgroundColor: "#1a9a6a18", color: "#1a9a6a" } : { backgroundColor: "#9ca3af18", color: "#6b7280" }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.running ? "#1a9a6a" : "#9ca3af" }} />
                  {t.running ? "Läuft" : "Pausiert"}
                </span>
              </div>
              {t.berufsbild && <p className="text-xs text-gray-500">{bb.label(t.berufsbild)}</p>}
              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{t.total}</p>
                  <p className="text-xs text-gray-500">Kandidat{t.total === 1 ? "" : "en"}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  {t.neu > 0 && <p style={{ color: "#0e7490" }}>{t.neu} neu</p>}
                  {t.vorqualifiziert > 0 && <p style={{ color: "#0369a1" }}>{t.vorqualifiziert} vorqualifiziert</p>}
                  {t.lastLeadAt && <p>letzter Lead {formatDate(t.lastLeadAt)}</p>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
