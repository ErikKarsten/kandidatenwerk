"use client"

import { useEffect, useState } from "react"
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

// Kompakter Werbegebiet-Hinweis im Kopf der Kundenseite (Paket 13): nur die Anzahl;
// ein Klick öffnet ein Fenster mit Karte, Kanzleistandort und den Radien, die ihn
// einschließen.
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

  const points: MapPoint[] = [{ lat, lng, label: clientName, sublabel: "Kanzleistandort", isSelf: true }]
  const circles: MapCircle[] = areas
    .filter((a) => a.lat !== null && a.lng !== null && a.radiusKm !== null)
    .map((a) => ({ lat: a.lat!, lng: a.lng!, radiusKm: a.radiusKm!, label: a.campaignTitle, sublabel: `${a.label} · ${a.radiusKm} km`, color: AD_AREA_COLOR }))

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium hover:bg-gray-50"
        style={covered ? { borderColor: "#1a9a6a55", color: "#1a9a6a" } : { borderColor: "#f59e0b66", color: "#b45309" }}
        title="Werbegebiete laufender Meta-Kampagnen auf der Karte anzeigen"
      >
        <Megaphone size={12} />
        {covered ? `Im Werbegebiet von ${campaignCount} Meta-Kampagne${campaignCount === 1 ? "" : "n"}` : "In keinem Werbegebiet"}
      </button>

      {open && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
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
              <MatchesMap points={points} circles={circles} height="420px" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
