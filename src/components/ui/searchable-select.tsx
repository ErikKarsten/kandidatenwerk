"use client"

import { useMemo, useRef, useState } from "react"

export interface SearchableSelectOption {
  id: string
  label: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  emptyLabel?: string
}

// Text-Eingabe mit Live-Filterung statt eines nativen <select> - bei langen Listen (z.B.
// alle Facebook-Seiten oder deren Lead-Formulare) tippt man einfach die ersten
// Buchstaben statt durch ein natives Dropdown zu scrollen. Bewusst ohne cmdk/Radix-
// Combobox gebaut (kein zusätzliches Package im Projekt) - reines Input+Liste, analog
// zu den anderen einfachen Formularfeldern hier.
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Suchen…",
  disabled = false,
  loading = false,
  loadingLabel = "Wird geladen…",
  emptyLabel = "Keine Treffer",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedLabel = options.find((o) => o.id === value)?.label ?? ""

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  function selectOption(option: SearchableSelectOption) {
    onChange(option.id)
    setQuery("")
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true)
        e.preventDefault()
      }
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const option = filtered[highlighted]
      if (option) selectOption(option)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={open ? query : selectedLabel}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlighted(0)
        }}
        onFocus={() => {
          setQuery("")
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={loading ? loadingLabel : placeholder}
        className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
        style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
      />
      {open && !disabled && (
        <div
          className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-white shadow-sm"
          style={{ borderColor: "#dde3ea" }}
        >
          {loading ? (
            <div className="px-3 py-2 text-sm text-gray-400">{loadingLabel}</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">{emptyLabel}</div>
          ) : (
            filtered.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectOption(option)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                style={i === highlighted ? { backgroundColor: "#e6edf6" } : undefined}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
