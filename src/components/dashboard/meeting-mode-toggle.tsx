"use client"

import { Presentation } from "lucide-react"

export function MeetingModeToggle({ on, onChange, className = "" }: { on: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium ${className}`}
      style={on ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "white" } : { borderColor: "#1e56a0", color: "#1e56a0", backgroundColor: "white" }}
      title={on ? "Interne Bereiche wieder einblenden" : "Für den Kundentermin interne Bereiche ausblenden"}
    >
      <Presentation size={15} />
      {on ? "Terminmodus beenden" : "Terminmodus"}
    </button>
  )
}
