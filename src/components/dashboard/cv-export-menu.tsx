"use client"

import { useState } from "react"
import { ChevronDown, FileText } from "lucide-react"

// Auswahl "Lebenslauf" (Paket 24, T-97): vollständig oder anonymisiert, öffnet die
// druckfertige Seite in einem neuen Tab.
export function CvExportMenu({ candidateId, openUp = false }: { candidateId: string; openUp?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
        style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
        aria-expanded={open}
      >
        <FileText size={14} /> Lebenslauf <ChevronDown size={13} />
      </button>
      {open && (
        <div
          className={`absolute z-[1300] w-56 overflow-hidden rounded-lg border bg-white shadow-lg ${openUp ? "bottom-full left-0 mb-1" : "right-0 mt-1"}`}
          style={{ borderColor: "#dde3ea" }}
        >
          <a href={`/lebenslauf/${candidateId}`} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="block px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
            Vollständiger Lebenslauf
          </a>
          <a
            href={`/lebenslauf/${candidateId}?variante=anonym`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block border-t px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            style={{ borderColor: "#eef2f6" }}
          >
            Anonymisierter Lebenslauf
          </a>
        </div>
      )}
    </div>
  )
}
