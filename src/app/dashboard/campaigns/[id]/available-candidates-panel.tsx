"use client"

import { useEffect, useState, useTransition } from "react"
import { CandidatePanel } from "@/components/dashboard/candidate-panel/candidate-panel"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react"
import dynamic from "next/dynamic"
import { assignCandidateToCampaignAction, searchAvailableCandidatesAction } from "./actions"
import type { MapPoint } from "@/components/dashboard/matches-map"
import type { AvailableCandidate, AvailableSort } from "@/lib/available-candidates"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"
import { SOURCE_OPTIONS } from "@/lib/candidate-source"
import { RadiusControl } from "@/components/ui/radius-control"
import { isNationwide } from "@/lib/radius"
import { LIVE_PHASE, PROJECT_PHASES } from "@/lib/client-project"

// Leaflet greift beim Import auf Browser-Globals zu - nur clientseitig laden.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl border bg-white py-12 text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
      Karte wird geladen…
    </div>
  ),
})

const selectClass = "rounded-md border bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1"
const borderStyle = { borderColor: "#dde3ea" }

interface SearchState {
  items: AvailableCandidate[]
  total: number
  totalPages: number
  page: number
  truncated: boolean
  campaignHasLocation: boolean
  effectiveRadiusKm: number | null
}

// Spaltenkopf zum Sortieren (Paket 84): erster Klick nächste bzw. neueste zuerst, zweiter
// Klick umgekehrt. Pfeil zeigt die aktive Richtung.
function SortHeader({
  label,
  asc,
  desc,
  sort,
  onSort,
  firstClick = "asc",
}: {
  label: string
  asc: AvailableSort
  desc: AvailableSort
  sort: AvailableSort
  onSort: (s: AvailableSort) => void
  firstClick?: "asc" | "desc"
}) {
  const active = sort === asc || sort === desc
  const next = active ? (sort === asc ? desc : asc) : firstClick === "asc" ? asc : desc
  return (
    <th className="px-4 py-2 font-medium">
      <button
        type="button"
        onClick={() => onSort(next)}
        className="inline-flex items-center gap-1 hover:text-gray-800"
        style={active ? { color: "#1e56a0" } : undefined}
        title={`Nach ${label} sortieren`}
      >
        {label}
        {active ? sort === asc ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="text-gray-300" />}
      </button>
    </th>
  )
}

// Reiter "Passende Kandidaten" einer Kanzlei-Kampagne (Atlas T-40): Kandidaten mit
// gleichem Berufsbild im Umkreis der Kampagne, die ihr noch nicht zugeordnet sind, mit
// Ein-Klick-Zuordnung. Einziger Ort, an dem Kandidaten Kanzlei-Kampagnen zugeordnet
// werden (außer "Weiterschieben" im Kandidatenprofil).
export function AvailableCandidatesPanel({
  campaign,
  clientPhase,
}: {
  campaign: { id: string; title: string; berufsbild: string | null; radius_km: number | null; lat: number | null; lng: number | null; extra_points?: { lat: number; lng: number; plz?: string | null }[] }
  // Projektphase der Kanzlei: zuordnen nur bei "Live" (Paket 78).
  clientPhase: string | null
}) {
  const clientLive = clientPhase === LIVE_PHASE
  const bb = useBerufsbilder()
  const berufsbildLabel = (value: string | null) => bb.label(value) ?? "ohne Berufsbild"
  const router = useRouter()
  const campaignId = campaign.id
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  // Startwert: Umkreis der Kampagne; frei einstellbar oder deutschlandweit (Paket 69).
  const [radiusKm, setRadiusKm] = useState(campaign.radius_km ?? 25)
  const [sort, setSort] = useState<AvailableSort>("distance")
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<SearchState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignedKeys, setAssignedKeys] = useState<Set<string>>(new Set())
  // Kandidat im Seitenfenster (Paket 13): Suche, Filter und Seite bleiben erhalten.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Suche erst 300 ms nach dem letzten Tastendruck auslösen.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    startLoading(async () => {
      const res = await searchAvailableCandidatesAction(campaignId, {
        q: debouncedQ,
        status: "vorqualifiziert",
        radius: isNationwide(radiusKm) ? "alle" : radiusKm,
        sort,
        page,
      })
      if ("error" in res) {
        setError(res.error)
        setResult(null)
        return
      }
      setError(null)
      setResult(res)
    })
  }, [campaignId, debouncedQ, radiusKm, sort, page])

  // Jede Filteränderung startet wieder auf Seite 1.
  function changeFilter(update: () => void) {
    update()
    setPage(1)
  }

  async function handleAssign(candidateId: string) {
    setAssigningId(candidateId)
    const res = await assignCandidateToCampaignAction(campaignId, candidateId)
    setAssigningId(null)
    if (res?.error) {
      setError(res.error)
      return
    }
    // Zeile bleibt mit "Zugeordnet" stehen (sichtbare Bestätigung); refresh()
    // aktualisiert den Reiter "Kandidaten" der Kampagne.
    setAssignedKeys((prev) => new Set(prev).add(`${campaignId}:${candidateId}`))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {!clientLive && (
        <p className="rounded-md border px-3 py-2 text-sm" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb", color: "#92400e" }}>
          Die Kanzlei ist noch nicht live (Projektphase „{PROJECT_PHASES.find((p) => p.value === clientPhase)?.label ?? "ohne Phase"}“). Kandidaten lassen sich erst
          zuordnen, wenn die Phase auf „Live“ steht.
        </p>
      )}
      {!campaign.berufsbild ? (
        <p className="text-sm text-red-600">
          Für diese Kampagne ist kein Berufsbild hinterlegt – bitte unter „Einrichtung“ ergänzen, dann erscheinen hier passende Kandidaten.
        </p>
      ) : (
        <p className="text-xs text-gray-500">
          Kandidaten mit Berufsbild „{berufsbildLabel(campaign.berufsbild)}“, die dieser Kampagne noch nicht zugeordnet sind.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => changeFilter(() => setQ(e.target.value))}
            placeholder="Name, E-Mail oder PLZ"
            className="w-full rounded-md border bg-white py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1"
            style={borderStyle}
          />
        </div>
        {/* Nur vorqualifizierte Kandidaten sind zuordenbar (Paket 19, T-86). */}
        <span className="self-center rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: "#16a34a1f", color: "#15803d" }}>
          Nur vorqualifizierte Kandidaten
        </span>
        <RadiusControl value={radiusKm} onChange={(km) => changeFilter(() => setRadiusKm(km))} />
        <select value={sort} onChange={(e) => changeFilter(() => setSort(e.target.value as AvailableSort))} className={selectClass} style={borderStyle}>
          <option value="distance">Nächste zuerst</option>
          <option value="farthest">Entfernteste zuerst</option>
          <option value="newest">Neueste zuerst</option>
          <option value="oldest">Älteste zuerst</option>
        </select>
      </div>

      {result && !result.campaignHasLocation && (
        <p className="text-xs text-gray-500">
          Die Kampagne hat keinen Standort (PLZ) - Entfernung und Umkreis sind nicht verfügbar.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && result.items.length > 0 && (
        <MatchesMap
          points={[
            { lat: campaign.lat, lng: campaign.lng, label: campaign.title, isSelf: true } as MapPoint,
            ...(campaign.extra_points ?? []).map((p) => ({ lat: p.lat, lng: p.lng, label: campaign.title, sublabel: p.plz ? `Standort ${p.plz}` : undefined, isSelf: true }) as MapPoint),
            ...result.items.map((c) => ({ lat: c.lat, lng: c.lng, label: c.name, sublabel: c.plz ?? undefined, onSelect: () => setSelectedId(c.id) })),
          ]}
        />
      )}

      <div className="overflow-x-auto rounded-xl border bg-white" style={borderStyle}>
        {!result ? (
          <p className="p-6 text-sm text-gray-400">{loading ? "Suche läuft…" : ""}</p>
        ) : result.items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">
            Keine passenden Kandidaten ({berufsbildLabel(campaign.berufsbild)}
            {result.effectiveRadiusKm !== null ? `, ${result.effectiveRadiusKm} km Umkreis` : ""}).
          </p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Berufsbild</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">PLZ</th>
                <SortHeader label="Entfernung" asc="distance" desc="farthest" sort={sort} onSort={(s) => changeFilter(() => setSort(s))} />
                <SortHeader label="Eingang" asc="oldest" desc="newest" sort={sort} onSort={(s) => changeFilter(() => setSort(s))} firstClick="desc" />
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className={loading ? "opacity-60" : undefined}>
              {result.items.map((c) => {
                const statusOpt = CANDIDATE_STATUS_OPTIONS.find((o) => o.value === c.status)
                const colors = statusOpt ?? CANDIDATE_STATUS_FALLBACK_COLORS
                const done = assignedKeys.has(`${campaignId}:${c.id}`)
                return (
                  <tr key={c.id} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                    <td className="px-4 py-2.5">
                      <button type="button" onClick={() => setSelectedId(c.id)} className="text-left font-medium hover:underline" style={{ color: "#1e56a0" }}>
                        {c.name}
                      </button>
                      {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{berufsbildLabel(c.berufsbild)}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>
                        {statusOpt?.label ?? c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{c.plz ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {c.distanceKm !== null ? `${Math.round(c.distanceKm)} km` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {new Date(c.createdAt).toLocaleDateString("de-DE")}
                      <div className="text-xs text-gray-400">{SOURCE_OPTIONS.find((o) => o.value === c.source)?.label ?? c.source}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        disabled={done || assigningId === c.id || !clientLive}
                        title={clientLive ? undefined : "Erst möglich, wenn die Kanzlei live ist"}
                        onClick={() => handleAssign(c.id)}
                        className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        style={{ backgroundColor: done ? "#1a9a6a" : "#1e56a0" }}
                      >
                        {done ? "Zugeordnet" : assigningId === c.id ? "…" : "Zuordnen"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {result && result.total > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>
            {result.total} Kandidat{result.total === 1 ? "" : "en"}
            {result.truncated ? " (Suche auf die neuesten 3.000 begrenzt - bitte Filter nutzen)" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={result.page <= 1 || loading}
              onClick={() => setPage(result.page - 1)}
              className="rounded border px-2 py-1 disabled:opacity-40"
              style={borderStyle}
            >
              Zurück
            </button>
            <span>
              Seite {result.page} von {result.totalPages}
            </span>
            <button
              type="button"
              disabled={result.page >= result.totalPages || loading}
              onClick={() => setPage(result.page + 1)}
              className="rounded border px-2 py-1 disabled:opacity-40"
              style={borderStyle}
            >
              Weiter
            </button>
          </div>
        </div>
      )}
      {selectedId && (
        <CandidatePanel
          candidateId={selectedId}
          onClose={() => setSelectedId(null)}
          campaign={{ id: campaign.id, title: campaign.title }}
          onAssigned={(id) => setAssignedKeys((prev) => new Set(prev).add(`${campaignId}:${id}`))}
        />
      )}
    </div>
  )
}
