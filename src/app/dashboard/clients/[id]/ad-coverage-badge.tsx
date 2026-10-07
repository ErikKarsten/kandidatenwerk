"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Megaphone, X } from "lucide-react"
import type { MapCircle, MapPoint } from "@/components/dashboard/matches-map"

// Leaflet greift beim Import auf Browser-Globals zu - nur clientseitig laden.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => <div className="flex h-[420px] items-center justify-center text-sm text-gray-400">Karte wird geladen…</div>,
})

export interface CoverageArea {
  campaignId: string
  campaignTitle: string
  label: string
  lat: number | null
  lng: number | null
  radiusKm: number | null
  distanceKm: number
}

const AD_AREA_COLOR = "#f59e0b"

// Werbegebiet-Hinweis (Paket 13): nur die Anzahl; ein Klick öffnet ein Fenster mit Karte,
// Kanzleistandort und den Radien, die ihn einschließen. Seit Paket 30 (T-122) als Leiste im
// Reiter Projekt, farbig nach Status (grün = abgedeckt, gelb = kein Werbegebiet).
export function AdCoverageBadge({
  clientName,
  lat,
  lng,
  areas,
}: {
  clientName: string
  lat: number
  lng: number
  areas: CoverageArea[]
}) {
  const [open, setOpen] = useState(false)
  const campaignCount = new Set(areas.map((a) => a.campaignId)).size
  const covered = areas.length > 0

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  // Stabil halten: neue Arrays bei jedem Render würden den Kartenausschnitt zurücksetzen.
  const points: MapPoint[] = useMemo(() => [{ lat, lng, label: clientName, sublabel: "Kanzleistandort", isSelf: true }], [lat, lng, clientName])
  const circles: MapCircle[] = useMemo(
    () =>
      areas
        .filter((a) => a.lat !== null && a.lng !== null && a.radiusKm !== null)
        .map((a) => ({ lat: a.lat!, lng: a.lng!, radiusKm: a.radiusKm!, label: a.campaignTitle, sublabel: `${a.label} · ${a.radiusKm} km`, color: AD_AREA_COLOR })),
    [areas]
  )

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors hover:brightness-95"
        style={covered ? { borderColor: "#1a9a6a55", backgroundColor: "#1a9a6a12", color: "#13784f" } : { borderColor: "#f59e0b66", backgroundColor: "#f59e0b12", color: "#b45309" }}
        title="Werbegebiete laufender Meta-Kampagnen auf der Karte anzeigen"
      >
        <Megaphone size={16} className="shrink-0" />
        <span className="min-w-0 flex-1">
          {covered
            ? `Kanzleistandort liegt im Werbegebiet von ${campaignCount} laufenden Meta-Kampagne${campaignCount === 1 ? "" : "n"}`
            : "Kanzleistandort liegt in keinem Werbegebiet einer laufenden Meta-Kampagne"}
        </span>
        <span className="shrink-0 text-xs font-normal underline">Auf der Karte ansehen</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: "#eef2f6" }}>
              <h2 className="text-sm font-semibold text-gray-900">Werbegebiete am Standort von {clientName}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Schließen">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {covered ? (
                <ul className="mb-3 flex flex-col gap-1 text-xs text-gray-600">
                  {areas.map((a) => (
                    <li key={`${a.campaignId}-${a.label}`}>
                      <Link href={`/dashboard/campaigns/${a.campaignId}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                        {a.campaignTitle}
                      </Link>{" "}
                      – {a.label}, Radius {a.radiusKm} km, {Math.round(a.distanceKm)} km vom Kanzleistandort
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-xs text-amber-700">Der Standort liegt in keinem Werbegebiet einer laufenden Meta-Kampagne – ggf. ist eine neue Kampagne nötig.</p>
              )}
              <MatchesMap points={points} circles={circles} height="420px" fitCircles />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
