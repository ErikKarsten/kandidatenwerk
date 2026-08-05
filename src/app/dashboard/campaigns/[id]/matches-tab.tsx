"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { MatchStatusSelect } from "@/components/dashboard/match-status-select"
import type { MapPoint } from "@/components/dashboard/matches-map"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"

function berufsbildLabel(value: string | null): string | undefined {
  if (!value) return undefined
  return BERUFSBILD_OPTIONS.find((o) => o.value === value)?.label ?? value
}

// Leaflet greift beim Modul-Import auf Browser-Globals zu - muss deshalb clientseitig-only
// geladen werden (ssr:false), sonst schlägt das Server-Rendering fehl.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl border bg-white py-12 text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
      Karte wird geladen…
    </div>
  ),
})

interface CandidateMatch {
  id: string
  candidateId: string
  firstName: string
  lastName: string
  distanceKm: number | null
  status: string
  matchedAt: string
  berufsbild: string | null
  lat: number | null
  lng: number | null
}

export function MatchesTab({
  matches,
  selfLat,
  selfLng,
  selfLabel,
}: {
  matches: CandidateMatch[]
  selfLat: number | null
  selfLng: number | null
  selfLabel: string
}) {
  const mapPoints: MapPoint[] = [
    { lat: selfLat, lng: selfLng, label: selfLabel, isSelf: true },
    ...matches.map((m) => ({
      lat: m.lat,
      lng: m.lng,
      label: `${m.firstName} ${m.lastName}`,
      sublabel: berufsbildLabel(m.berufsbild),
    })),
  ]

  return (
    <div className="flex flex-col gap-4">
      <MatchesMap points={mapPoints} />

      {matches.length === 0 ? (
        <div
          className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400"
          style={{ borderColor: "#dde3ea" }}
        >
          Noch keine passenden Kandidaten gefunden.
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #dde3ea" }}>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Kandidat</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Entfernung</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Gematcht am</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m, i) => (
                <tr key={m.id} style={{ borderBottom: i < matches.length - 1 ? "1px solid #dde3ea" : undefined }}>
                  <td className="px-4 py-2.5 font-medium">
                    <Link href={`/dashboard/candidates/${m.candidateId}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                      {m.firstName} {m.lastName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {m.distanceKm !== null ? `${m.distanceKm.toFixed(1)} km` : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <MatchStatusSelect matchId={m.id} currentStatus={m.status} />
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">
                    {new Date(m.matchedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
