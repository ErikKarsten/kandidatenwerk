"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Printer, Sparkles } from "lucide-react"
import { enrichCvWerdegangAction } from "@/app/dashboard/candidates/[id]/actions"

// Leiste über dem Lebenslauf (nicht gedruckt): Variante wechseln, Werdegang per KI
// (neu) anreichern (Paket 43; fehlt er, automatisch beim Öffnen) und als PDF sichern.
export function CvToolbar({ candidateId, anonym, hasWerdegang }: { candidateId: string; anonym: boolean; hasWerdegang: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  function enrich() {
    startTransition(async () => {
      setError(null)
      const res = await enrichCvWerdegangAction(candidateId)
      if ("error" in res) setError(res.error)
      else router.refresh()
    })
  }

  useEffect(() => {
    if (hasWerdegang || started.current) return
    started.current = true
    enrich()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWerdegang])

  const tab = (active: boolean) =>
    active ? { backgroundColor: "#1e56a0", color: "white", borderColor: "#1e56a0" } : { backgroundColor: "white", color: "#374151", borderColor: "#dde3ea" }
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-col gap-2 px-4 print:hidden sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link href={`/lebenslauf/${candidateId}`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(!anonym)}>
            Vollständig
          </Link>
          <Link href={`/lebenslauf/${candidateId}?variante=anonym`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(anonym)}>
            Anonymisiert
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={enrich}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: "#1e56a0", color: "#1e56a0" }}
          >
            <Sparkles size={14} /> {hasWerdegang ? "Werdegang neu anreichern" : "Werdegang ergänzen"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <Printer size={14} /> Als PDF speichern / drucken
          </button>
        </div>
      </div>
      {pending && (
        <p className="rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "#1e56a012", color: "#1e56a0" }}>
          Werdegang wird per KI aus den Angaben formuliert und um typische Aufgaben des Berufsbilds ergänzt (dauert etwa eine Minute)…
        </p>
      )}
      {error && <p className="text-xs text-red-600">Werdegang konnte nicht ergänzt werden: {error}</p>}
    </div>
  )
}
