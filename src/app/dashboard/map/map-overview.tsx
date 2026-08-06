"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import type { MapPoint } from "@/components/dashboard/matches-map"

// Leaflet greift beim Modul-Import auf Browser-Globals zu - muss deshalb clientseitig-only
// geladen werden (ssr:false), sonst schlägt das Server-Rendering fehl (gleiches Muster
// wie matches-section.tsx / matches-tab.tsx).
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => (
    <div
      className="flex items-center justify-center rounded-xl border bg-white py-12 text-sm text-gray-400"
      style={{ borderColor: "#dde3ea" }}
    >
      Karte wird geladen…
    </div>
  ),
})

export interface MapClientPoint {
  id: string
  name: string
  lat: number
  lng: number
}

export interface MapCandidatePoint {
  id: string
  name: string
  lat: number
  lng: number
  // true = kein eigenes lat/lng auf dem Kandidaten, Koordinaten stattdessen vom
  // Kanzlei-Standort der zugeordneten Kampagne übernommen (Näherungswert).
  approximate: boolean
}

// Zwei unabhängige Toggle-Reihen statt eines einzelnen 5-Werte-Enums: "Art" entscheidet
// Kanzlei/Kandidat/Beide, "Genauigkeit" filtert innerhalb der Kandidaten zusätzlich nach
// eigenem vs. ungefährem Standort. Die zweite Reihe wird nur angezeigt, wenn Kandidaten
// überhaupt einbezogen sind (Art ≠ "clients") - bei 5 flachen Buttons in einer Zeile
// wäre es auf schmaleren Bildschirmen zu eng geworden.
type TypeFilter = "all" | "clients" | "candidates"
type AccuracyFilter = "all" | "own" | "approx"

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Beide" },
  { value: "clients", label: "Nur Kanzleien" },
  { value: "candidates", label: "Nur Kandidaten" },
]

const ACCURACY_OPTIONS: { value: AccuracyFilter; label: string }[] = [
  { value: "all", label: "Beide" },
  { value: "own", label: "Eigener Standort" },
  { value: "approx", label: "Ungefährer Standort" },
]

const CLIENT_COLOR = "#dc2626"
const CANDIDATE_COLOR = "#1e56a0"

export function MapOverview({
  clients,
  candidates,
}: {
  clients: MapClientPoint[]
  candidates: MapCandidatePoint[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  const [accuracyFilter, setAccuracyFilter] = useState<AccuracyFilter>("all")

  const candidatesWithOwnLocation = useMemo(() => candidates.filter((c) => !c.approximate).length, [candidates])
  const candidatesWithApproxLocation = candidates.length - candidatesWithOwnLocation

  const includeClients = typeFilter !== "candidates"
  const includeCandidates = typeFilter !== "clients"

  const points: MapPoint[] = useMemo(() => {
    const clientPoints: MapPoint[] = includeClients
      ? clients.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          label: c.name,
          sublabel: "Kanzlei",
          color: CLIENT_COLOR,
          href: `/dashboard/clients/${c.id}`,
        }))
      : []

    const filteredCandidates = includeCandidates
      ? candidates.filter((c) => {
          if (accuracyFilter === "own") return !c.approximate
          if (accuracyFilter === "approx") return c.approximate
          return true
        })
      : []

    const candidatePoints: MapPoint[] = filteredCandidates.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      label: c.name,
      sublabel: "Kandidat",
      color: CANDIDATE_COLOR,
      approximate: c.approximate,
      note: c.approximate ? "Ungefährer Standort, keine eigene PLZ hinterlegt" : undefined,
      href: `/dashboard/candidates/${c.id}`,
    }))

    return [...clientPoints, ...candidatePoints]
  }, [clients, candidates, includeClients, includeCandidates, accuracyFilter])

  return (
    <div className="flex flex-col gap-4">
      {/* Zusammenfassung */}
      <div
        className="rounded-xl border bg-white px-4 py-3 text-sm text-gray-600"
        style={{ borderColor: "#dde3ea" }}
      >
        <span className="font-medium text-gray-900">{clients.length}</span>{" "}
        Kanzlei{clients.length !== 1 ? "en" : ""},{" "}
        <span className="font-medium text-gray-900">{candidatesWithOwnLocation}</span>{" "}
        Kandidat{candidatesWithOwnLocation !== 1 ? "en" : ""} mit eigenem Standort,{" "}
        <span className="font-medium text-gray-900">{candidatesWithApproxLocation}</span>{" "}
        mit ungefährem Standort
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Filterleisten */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "#dde3ea" }}>
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTypeFilter(opt.value)}
                className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: typeFilter === opt.value ? "#1e56a0" : "transparent",
                  color: typeFilter === opt.value ? "white" : "#6b7280",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {includeCandidates && (
            <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "#dde3ea" }}>
              {ACCURACY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAccuracyFilter(opt.value)}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: accuracyFilter === opt.value ? "#4ba3c3" : "transparent",
                    color: accuracyFilter === opt.value ? "white" : "#6b7280",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Legende */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CLIENT_COLOR }} />
            Kanzlei
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CANDIDATE_COLOR }} />
            Kandidat (eigener Standort)
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CANDIDATE_COLOR, border: "2px dashed #374151" }}
            />
            Kandidat (ungefährer Standort)
          </span>
        </div>
      </div>

      <MatchesMap points={points} height="600px" scrollWheelZoom />
    </div>
  )
}
