"use client"

import { useEffect, useRef, useState } from "react"
import { NATIONWIDE_KM, isNationwide } from "@/lib/radius"

// Umkreis einstellen (Paket 69) - überall gleich: Schieberegler und Zahlenfeld, dazu ein
// Haken "Deutschlandweit" (gespeichert als NATIONWIDE_KM). compact: nur Zahlenfeld und
// Haken, z. B. in engen Zeilen. Änderungen am Regler kommen leicht verzögert an, damit
// Suchen nicht bei jedem Pixel neu laden.
export function RadiusControl({
  value,
  onChange,
  min = 5,
  max = 200,
  step = 5,
  allowNationwide = true,
  compact = false,
  label = "Umkreis",
  disabled = false,
}: {
  value: number
  onChange: (km: number) => void
  min?: number
  max?: number
  step?: number
  allowNationwide?: boolean
  compact?: boolean
  label?: string | null
  disabled?: boolean
}) {
  const nationwide = allowNationwide && isNationwide(value)
  const [draft, setDraft] = useState(nationwide ? "" : String(value))
  // Letzter Wert in km - Ziel, wenn "Deutschlandweit" wieder abgewählt wird.
  const [lastKm, setLastKm] = useState(nationwide ? 25 : value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wert von außen geändert: Anzeige nachziehen (Vergleich mit dem vorigen Wert statt Effekt).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (!isNationwide(value)) {
      setDraft(String(value))
      setLastKm(value)
    }
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function commit(km: number, delay = 0) {
    if (timer.current) clearTimeout(timer.current)
    if (delay) timer.current = setTimeout(() => onChange(km), delay)
    else onChange(km)
  }

  function commitDraft() {
    const km = Math.round(Number(draft.replace(",", ".")))
    if (!Number.isFinite(km) || km < 1) {
      setDraft(String(lastKm))
      return
    }
    const clamped = Math.min(km, NATIONWIDE_KM - 1)
    setDraft(String(clamped))
    setLastKm(clamped)
    if (clamped !== value) commit(clamped)
  }

  const numberDisabled = disabled || nationwide
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {label && <span className="text-xs font-medium text-gray-500">{label}</span>}
      {!compact && (
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Math.min(Math.max(Number(draft) || min, min), max)}
          onChange={(e) => {
            setDraft(e.target.value)
            setLastKm(Number(e.target.value))
            commit(Number(e.target.value), 250)
          }}
          disabled={numberDisabled}
          aria-label={`${label ?? "Umkreis"} in km`}
          className="w-32 cursor-pointer accent-[#1e56a0] disabled:cursor-not-allowed disabled:opacity-40 sm:w-40"
        />
      )}
      <span className={`inline-flex items-center gap-1 text-sm text-gray-600 ${numberDisabled ? "opacity-40" : ""}`}>
        <input
          type="number"
          min={1}
          max={NATIONWIDE_KM - 1}
          value={nationwide ? "" : draft}
          placeholder={nationwide ? "–" : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              commitDraft()
            }
          }}
          disabled={numberDisabled}
          aria-label={`${label ?? "Umkreis"} in km`}
          className="w-16 rounded-md border bg-white px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-1 disabled:cursor-not-allowed"
          style={{ borderColor: "#dde3ea" }}
        />
        km
      </span>
      {allowNationwide && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={nationwide}
            disabled={disabled}
            onChange={(e) => commit(e.target.checked ? NATIONWIDE_KM : lastKm)}
            className="accent-[#1e56a0]"
          />
          Deutschlandweit
        </label>
      )}
    </div>
  )
}
