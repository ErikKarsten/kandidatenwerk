"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { assignCandidateToClientCampaignAction, searchAvailableCandidatesAction } from "./actions"
import type { AvailableCandidate, AvailableSort } from "@/lib/available-candidates"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"
import { SOURCE_OPTIONS } from "@/lib/candidate-source"

export interface KanzleiCampaign {
  id: string
  title: string
  berufsbild: string | null
  radius_km: number
  plz: string | null
}

const RADIUS_OPTIONS = [
  { value: "kampagne", label: "Umkreis der Kampagne" },
  { value: "50", label: "50 km" },
  { value: "100", label: "100 km" },
  { value: "alle", label: "Ohne Umkreis" },
]

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

function berufsbildLabel(value: string | null): string {
  return BERUFSBILD_OPTIONS.find((o) => o.value === value)?.label ?? "ohne Berufsbild"
}

// "Verfügbare Kandidaten" im Kundenprofil (Atlas T-33): immer für eine Kanzlei-Kampagne
// dieses Kunden - Kandidaten mit gleichem Berufsbild im Umkreis der Kampagne, die ihr
// noch nicht zugeordnet sind, mit Ein-Klick-Zuordnung zur Kampagne.
export function AvailableCandidatesPanel({
  clientId,
  campaigns,
}: {
  clientId: string
  campaigns: KanzleiCampaign[]
}) {
  const router = useRouter()
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "")
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [status, setStatus] = useState("alle")
  const [radius, setRadius] = useState("kampagne")
  const [sort, setSort] = useState<AvailableSort>("distance")
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<SearchState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignedKeys, setAssignedKeys] = useState<Set<string>>(new Set())

  const campaign = campaigns.find((c) => c.id === campaignId) ?? null

  // Suche erst 300 ms nach dem letzten Tastendruck auslösen.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    if (!campaignId) return
    startLoading(async () => {
      const res = await searchAvailableCandidatesAction(clientId, {
        campaignId,
        q: debouncedQ,
        status,
        radius: radius === "kampagne" || radius === "alle" ? radius : Number(radius),
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
  }, [clientId, campaignId, debouncedQ, status, radius, sort, page])

  // Jede Filteränderung startet wieder auf Seite 1.
  function changeFilter(update: () => void) {
    update()
    setPage(1)
  }

  async function handleAssign(candidateId: string) {
    setAssigningId(candidateId)
    const res = await assignCandidateToClientCampaignAction(clientId, campaignId, candidateId)
    setAssigningId(null)
    if (res?.error) {
      setError(res.error)
      return
    }
    // Zeile bleibt mit "Zugeordnet" stehen (sichtbare Bestätigung); refresh()
    // aktualisiert den Zähler "Zugeordnet (n)".
    setAssignedKeys((prev) => new Set(prev).add(`${campaignId}:${candidateId}`))
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-gray-600">Für Kampagne</label>
        <select
          value={campaignId}
          onChange={(e) => changeFilter(() => setCampaignId(e.target.value))}
          className={`${selectClass} min-w-[240px]`}
          style={borderStyle}
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({berufsbildLabel(c.berufsbild)}, {c.radius_km} km)
            </option>
          ))}
        </select>
      </div>

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
        <select value={status} onChange={(e) => changeFilter(() => setStatus(e.target.value))} className={selectClass} style={borderStyle}>
          <option value="alle">Alle Status</option>
          {CANDIDATE_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select value={radius} onChange={(e) => changeFilter(() => setRadius(e.target.value))} className={selectClass} style={borderStyle}>
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.value === "kampagne" && campaign ? `Umkreis der Kampagne (${campaign.radius_km} km)` : o.label}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => changeFilter(() => setSort(e.target.value as AvailableSort))} className={selectClass} style={borderStyle}>
          <option value="distance">Nächste zuerst</option>
          <option value="newest">Neueste zuerst</option>
        </select>
      </div>

      {result && !result.campaignHasLocation && (
        <p className="text-xs text-gray-500">
          Die Kampagne hat keinen Standort (PLZ) - Entfernung und Umkreis sind nicht verfügbar.
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border bg-white" style={borderStyle}>
        {!result ? (
          <p className="p-6 text-sm text-gray-400">{loading ? "Suche läuft…" : ""}</p>
        ) : result.items.length === 0 ? (
          <p className="p-6 text-sm text-gray-400">
            Keine passenden Kandidaten ({berufsbildLabel(campaign?.berufsbild ?? null)}
            {result.effectiveRadiusKm !== null ? `, ${result.effectiveRadiusKm} km Umkreis` : ""}).
          </p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">PLZ</th>
                <th className="px-4 py-2 font-medium">Entfernung</th>
                <th className="px-4 py-2 font-medium">Eingang</th>
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
                      <Link href={`/dashboard/candidates/${c.id}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                        {c.name}
                      </Link>
                      {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                    </td>
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
                        disabled={done || assigningId === c.id}
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
    </div>
  )
}
