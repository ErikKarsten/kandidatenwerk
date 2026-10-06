"use client"

import Link from "next/link"
import { Printer } from "lucide-react"

// Leiste über dem Lebenslauf (nicht gedruckt): Variante wechseln und als PDF sichern.
export function CvToolbar({ candidateId, anonym }: { candidateId: string; anonym: boolean }) {
  const tab = (active: boolean) =>
    active ? { backgroundColor: "#1e56a0", color: "white", borderColor: "#1e56a0" } : { backgroundColor: "white", color: "#374151", borderColor: "#dde3ea" }
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 px-4 print:hidden sm:px-0">
      <div className="flex gap-2">
        <Link href={`/lebenslauf/${candidateId}`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(!anonym)}>
          Vollständig
        </Link>
        <Link href={`/lebenslauf/${candidateId}?variante=anonym`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(anonym)}>
          Anonymisiert
        </Link>
      </div>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white"
        style={{ backgroundColor: "#1e56a0" }}
      >
        <Printer size={14} /> Als PDF speichern / drucken
      </button>
    </div>
  )
}
