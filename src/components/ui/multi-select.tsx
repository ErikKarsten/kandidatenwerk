"use client"

import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"

export interface MultiSelectOption {
  value: string
  label: string
  count?: number
}

// Aufklappliste mit Mehrfachauswahl (Paket 86, z. B. Berufsbilder auf der Karte). Leere
// Auswahl = alle. Schließt bei Klick daneben oder Escape.
export function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  pluralLabel,
  disabled = false,
}: {
  options: MultiSelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  allLabel: string
  // z. B. "Berufsbilder" -> "3 Berufsbilder"
  pluralLabel: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const selected = options.filter((o) => value.includes(o.value))
  const summary =
    selected.length === 0 ? allLabel : selected.length <= 2 ? selected.map((o) => o.label).join(", ") : `${selected.length} ${pluralLabel}`

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-expanded={open}
        className="flex max-w-xs items-center gap-1.5 rounded-md border bg-white px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
        style={{ borderColor: selected.length ? "#1e56a0" : "#dde3ea", color: selected.length ? "#1e56a0" : "#4b5563" }}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[1100] mt-1 w-72 overflow-hidden rounded-lg border bg-white shadow-lg" style={{ borderColor: "#dde3ea" }}>
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-xs font-medium hover:bg-gray-50"
            style={{ borderColor: "#eef2f6", color: value.length ? "#1e56a0" : "#111827" }}
          >
            <span className="flex h-3.5 w-3.5 items-center justify-center">{value.length === 0 && <Check size={13} />}</span>
            {allLabel}
          </button>
          <ul className="max-h-72 overflow-y-auto py-1">
            {options.map((o) => {
              const checked = value.includes(o.value)
              return (
                <li key={o.value}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                    <input type="checkbox" checked={checked} onChange={() => toggle(o.value)} className="h-3.5 w-3.5" />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.count !== undefined && <span className="shrink-0 text-gray-400">{o.count}</span>}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
