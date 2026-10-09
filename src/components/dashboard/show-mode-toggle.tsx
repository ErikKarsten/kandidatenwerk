"use client"

import { Eye, EyeOff } from "lucide-react"

// Schalter für den Anonymisierter Modus (Paket 28, T-110).
export function ShowModeToggle({ on, onChange, className = "" }: { on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? "Anonymisierten Modus beenden" : "Anonymisierter Modus: personenbezogene Daten ausblenden"}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors ${className}`}
      style={on ? { borderColor: "#7c3aed", backgroundColor: "#7c3aed", color: "#fff" } : { borderColor: "#dde3ea", backgroundColor: "#fff", color: "#374151" }}
    >
      {on ? <EyeOff size={14} /> : <Eye size={14} />}
      {on ? "Anonymisiert an" : "Anonymisierter Modus"}
    </button>
  )
}
