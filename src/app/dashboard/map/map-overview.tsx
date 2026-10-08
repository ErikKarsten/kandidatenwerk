"use client"

import { useMemo, useRef, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { Search } from "lucide-react"
import type { MapCircle, MapPoint, MatchesMapHandle, SearchPin } from "@/components/dashboard/matches-map"
import { CandidatePanel } from "@/components/dashboard/candidate-panel/candidate-panel"
import type { AdArea } from "@/lib/meta-campaigns-queries"
import { geocodePlz } from "@/lib/geocode-plz"
import { searchLocationAction } from "./actions"
import { ShowModeToggle } from "@/components/dashboard/show-mode-toggle"
import { anonymousName, useShowMode } from "@/lib/show-mode"
import { berufsbildLabel } from "@/lib/berufsbild"

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

// Umkreis um gesuchten Ort, gesuchte Kanzlei/Kandidat oder angeklickten Punkt.
const FOCUS_RADIUS_KM = 30
const FOCUS_COLOR = "#dc2626"
const MAX_SUGGESTIONS = 8

// Ein Punkt je Standort (Paket 16, T-75) - ein Kunde kann mehrere Punkte haben.
export interface MapClientPoint {
  id: string
  name: string
  lat: number
  lng: number
  place?: string | null
}

export interface MapCandidatePoint {
  id: string
  name: string
  berufsbild?: string | null
  lat: number
  lng: number
  // true = kein eigenes lat/lng auf dem Kandidaten, Koordinaten stattdessen vom
  // Kanzlei-Standort der zugeordneten Kampagne übernommen (Näherungswert).
  approximate: boolean
}

// "Art" entscheidet Kanzlei/Kandidat/Beide (Filter nach Genauigkeit entfernt, Paket 41).
type TypeFilter = "all" | "clients" | "candidates"

interface Focus {
  lat: number
  lng: number
  label: string
}

interface Suggestion extends Focus {
  key: string
  kind: "Kanzlei" | "Kandidat"
  sublabel?: string | null
}

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Beide" },
  { value: "clients", label: "Nur Kanzleien" },
  { value: "candidates", label: "Nur Kandidaten" },
]

const CLIENT_COLOR = "#dc2626"
const CANDIDATE_COLOR = "#1e56a0"

const AD_AREA_COLOR = "#f59e0b"

export function MapOverview({
  clients,
  candidates,
  adAreas = [],
}: {
  clients: MapClientPoint[]
  candidates: MapCandidatePoint[]
  adAreas?: AdArea[]
}) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all")
  // Ebene "Werbegebiete" (Atlas T-38): Radius jeder aktiven Anzeigengruppe laufender
  // Meta-Kampagnen, ein-/ausblendbar.
  const [showAdAreas, setShowAdAreas] = useState(false)
  const adCircles = useMemo<MapCircle[]>(
    () =>
      adAreas
        .filter((a) => a.lat !== null && a.lng !== null && a.radiusKm !== null)
        .map((a) => ({
          lat: a.lat!,
          lng: a.lng!,
          radiusKm: a.radiusKm!,
          label: a.campaignTitle,
          sublabel: `${a.label} · ${a.radiusKm} km`,
          color: AD_AREA_COLOR,
        })),
    [adAreas]
  )
  // Kandidat im Seitenfenster statt Seitenwechsel (Paket 13, T-55).
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null)
  // Anonymisierter Modus (Paket 29): Kandidaten nur mit Kennung und Berufsbild, Kanzleien ohne Namen,
  // Seitenfenster anonymisiert - zum Vorführen beim Kunden.
  const [showMode, setShowMode] = useShowMode()

  const mapRef = useRef<MatchesMapHandle>(null)
  const [locationQuery, setLocationQuery] = useState("")
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchPending, startSearchTransition] = useTransition()
  const [searchPin, setSearchPin] = useState<SearchPin | null>(null)
  // 30-km-Umkreis (Paket 41): nach jeder Suche und bei Klick auf einen Punkt.
  const [focus, setFocus] = useState<Focus | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)

  function focusOn(target: Focus, opts: { pin?: boolean; fly?: boolean } = {}) {
    setFocus(target)
    setSearchPin(opts.pin ? { lat: target.lat, lng: target.lng, label: target.label, ringsKm: [] } : null)
    if (opts.fly) mapRef.current?.flyToRadius(target.lat, target.lng, FOCUS_RADIUS_KM)
  }

  function clearFocus() {
    setFocus(null)
    setSearchPin(null)
  }

  // Kanzleien und (außer im anonymisierten Modus) Kandidaten nach Namen.
  const suggestions = useMemo<Suggestion[]>(() => {
    const q = locationQuery.trim().toLowerCase()
    if (q.length < 2 || /^\d+$/.test(q) || showMode) return []
    const seen = new Set<string>()
    const out: Suggestion[] = []
    for (const c of clients) {
      const key = `k:${c.id}:${c.lat},${c.lng}`
      if (!c.name.toLowerCase().includes(q) || seen.has(key)) continue
      seen.add(key)
      out.push({ key, kind: "Kanzlei", label: c.name, sublabel: c.place, lat: c.lat, lng: c.lng })
    }
    for (const c of candidates) {
      if (!c.name.toLowerCase().includes(q)) continue
      out.push({ key: `c:${c.id}`, kind: "Kandidat", label: c.name, sublabel: berufsbildLabel(c.berufsbild), lat: c.lat, lng: c.lng })
    }
    return out.slice(0, MAX_SUGGESTIONS)
  }, [locationQuery, clients, candidates, showMode])

  function pickSuggestion(s: Suggestion) {
    setLocationQuery(s.label)
    setSuggestOpen(false)
    setSearchError(null)
    focusOn(s, { fly: true })
  }

  function handleLocationSearch() {
    const query = locationQuery.trim()
    if (!query) return
    setSearchError(null)
    setSuggestOpen(false)
    // Genau eine Kanzlei/ein Kandidat mit diesem Namen: direkt dorthin.
    const exact = suggestions.find((s) => s.label.toLowerCase() === query.toLowerCase())
    if (exact) {
      pickSuggestion(exact)
      return
    }

    // PLZ (genau 5 Ziffern) lokal aus der bereits vorhandenen PLZ-Koordinatentabelle
    // auflösen - kein Netzwerk nötig, gleicher Mechanismus wie bei Kunden. Alles
    // andere wird als Ortsname behandelt und per Server Action (Nominatim) gesucht.
    if (/^\d{5}$/.test(query)) {
      const coords = geocodePlz(query)
      if (!coords) {
        setSearchError(`PLZ "${query}" nicht gefunden.`)
        return
      }
      focusOn({ lat: coords.lat, lng: coords.lng, label: `PLZ ${query}` }, { pin: true, fly: true })
      return
    }

    startSearchTransition(async () => {
      const result = await searchLocationAction(query)
      if ("error" in result) {
        // Kein Ort gefunden, aber Namenstreffer: den ersten nehmen.
        if (suggestions.length > 0) pickSuggestion(suggestions[0])
        else setSearchError(result.error)
        return
      }
      focusOn({ lat: result.lat, lng: result.lng, label: query }, { pin: true, fly: true })
    })
  }

  const includeClients = typeFilter !== "candidates"
  const includeCandidates = typeFilter !== "clients"

  const points: MapPoint[] = useMemo(() => {
    const clientPoints: MapPoint[] = includeClients
      ? clients.map((c) => ({
          lat: c.lat,
          lng: c.lng,
          label: showMode ? "Kanzlei" : c.name,
          sublabel: showMode ? undefined : c.place ? `Kanzlei · ${c.place}` : "Kanzlei",
          color: CLIENT_COLOR,
          href: showMode ? undefined : `/dashboard/clients/${c.id}`,
        }))
      : []

    const filteredCandidates = includeCandidates ? candidates : []

    const candidatePoints: MapPoint[] = filteredCandidates.map((c) => ({
      lat: c.lat,
      lng: c.lng,
      label: showMode ? anonymousName(c.id) : c.name,
      sublabel: [showMode ? null : "Kandidat", berufsbildLabel(c.berufsbild)].filter(Boolean).join(" · ") || "Kandidat",
      color: CANDIDATE_COLOR,
      approximate: c.approximate,
      note: c.approximate ? "Ungefährer Standort, keine eigene PLZ hinterlegt" : undefined,
      onSelect: () => setSelectedCandidateId(c.id),
    }))

    return [...clientPoints, ...candidatePoints]
  }, [clients, candidates, includeClients, includeCandidates, showMode])

  const circles = useMemo<MapCircle[]>(
    () => [
      ...(showAdAreas ? adCircles : []),
      ...(focus
        ? [{ lat: focus.lat, lng: focus.lng, radiusKm: FOCUS_RADIUS_KM, label: `${FOCUS_RADIUS_KM} km`, color: FOCUS_COLOR, interactive: false, dashed: true }]
        : []),
    ],
    [showAdAreas, adCircles, focus]
  )

  return (
    <div className="flex flex-col gap-4">
      {/* Suche nach PLZ, Ort, Kanzlei oder Kandidat - reine Ansichtsänderung, filtert
          nichts. Treffer bekommen einen 30-km-Umkreis (Paket 41), Orte zusätzlich eine
          Stecknadel. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={locationQuery}
              onChange={(e) => {
                setLocationQuery(e.target.value)
                setSuggestOpen(true)
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLocationSearch()
                if (e.key === "Escape") setSuggestOpen(false)
              }}
              placeholder={showMode ? "PLZ oder Ort suchen…" : "PLZ, Ort, Kanzlei oder Kandidat suchen…"}
              className="w-full rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea" }}
            />
            {suggestOpen && suggestions.length > 0 && (
              <ul
                className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-72 overflow-y-auto rounded-md border bg-white py-1 shadow-lg"
                style={{ borderColor: "#dde3ea" }}
              >
                {suggestions.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.kind === "Kanzlei" ? CLIENT_COLOR : CANDIDATE_COLOR }} />
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      {s.sublabel && <span className="shrink-0 text-xs text-gray-400">{s.sublabel}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={handleLocationSearch}
            disabled={searchPending || !locationQuery.trim()}
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {searchPending ? "Suche…" : "Suchen"}
          </button>
          {(searchPin || focus) && (
            <button
              type="button"
              onClick={clearFocus}
              className="shrink-0 rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              style={{ borderColor: "#dde3ea" }}
            >
              Umkreis entfernen
            </button>
          )}
          <div className="ml-auto">
            <ShowModeToggle on={showMode} onChange={setShowMode} />
          </div>
        </div>
        {searchError && <p className="text-xs text-red-500">{searchError}</p>}
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

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={showAdAreas} onChange={(e) => setShowAdAreas(e.target.checked)} />
            Werbegebiete laufender Meta-Kampagnen ({adCircles.length})
          </label>
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
          {showAdAreas && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ border: `2px solid ${AD_AREA_COLOR}`, backgroundColor: `${AD_AREA_COLOR}22` }} />
              Werbegebiet
            </span>
          )}
          {focus && (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ border: `2px dashed ${FOCUS_COLOR}` }} />
              Umkreis {FOCUS_RADIUS_KM} km
            </span>
          )}
        </div>
      </div>

      <MatchesMap
        ref={mapRef}
        points={points}
        circles={circles}
        height="clamp(420px, calc(100vh - 260px), 1400px)"
        scrollWheelZoom
        searchPin={searchPin}
        onMarkerClick={(lat, lng) => focusOn({ lat, lng, label: "Umkreis" })}
      />
      {selectedCandidateId && <CandidatePanel candidateId={selectedCandidateId} onClose={() => setSelectedCandidateId(null)} anonymize={showMode} />}
    </div>
  )
}
