"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Download, Printer, Sparkles } from "lucide-react"
import type { CvPdfData } from "./cv-pdf"
import { enrichCvWerdegangAction } from "@/app/dashboard/candidates/[id]/actions"
import { enrichPortalCvAction } from "@/app/portal/actions"

// Leiste über dem Lebenslauf (nicht gedruckt): Variante wechseln, Werdegang per KI
// (neu) erstellen (Paket 43; fehlt er oder haben sich die Angaben geändert, automatisch
// beim Öffnen - Paket 82) und als PDF sichern.
// portal (Paket 87): Kanzlei im Kundenportal - ohne Varianten-Wechsel und ohne
// "Werdegang neu erstellen", nur PDF; der Werdegang entsteht bei Bedarf automatisch.
export function CvToolbar({
  candidateId,
  anonym,
  hasWerdegang,
  outdated = false,
  portal = false,
  pdfData,
}: {
  candidateId: string
  anonym: boolean
  hasWerdegang: boolean
  outdated?: boolean
  portal?: boolean
  // Inhalt für "PDF herunterladen" (Paket 88).
  pdfData: CvPdfData
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const [pdfPending, setPdfPending] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  async function downloadPdf() {
    setPdfPending(true)
    setPdfError(null)
    try {
      const { downloadCvPdf } = await import("./cv-pdf")
      await downloadCvPdf(pdfData)
    } catch (err) {
      console.error("PDF fehlgeschlagen:", err)
      setPdfError("Die PDF konnte nicht erstellt werden. Bitte erneut versuchen oder über „Drucken“ speichern.")
    } finally {
      setPdfPending(false)
    }
  }

  function enrich() {
    startTransition(async () => {
      setError(null)
      const res = portal ? await enrichPortalCvAction(candidateId) : await enrichCvWerdegangAction(candidateId)
      if ("error" in res) setError(res.error)
      else router.refresh()
    })
  }

  useEffect(() => {
    if ((hasWerdegang && !outdated) || started.current) return
    started.current = true
    enrich()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWerdegang, outdated])

  const tab = (active: boolean) =>
    active ? { backgroundColor: "#1e56a0", color: "white", borderColor: "#1e56a0" } : { backgroundColor: "white", color: "#374151", borderColor: "#dde3ea" }
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-col gap-2 px-4 print:hidden sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {portal ? (
          <span className="text-xs text-gray-500">Lebenslauf als PDF herunterladen oder drucken</span>
        ) : (
          <div className="flex gap-2">
            <Link href={`/lebenslauf/${candidateId}`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(!anonym)}>
              Vollständig
            </Link>
            <Link href={`/lebenslauf/${candidateId}?variante=anonym`} className="rounded-full border px-3 py-1 text-xs font-medium" style={tab(anonym)}>
              Anonymisiert
            </Link>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!portal && (
            <button
              type="button"
              onClick={enrich}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              style={{ borderColor: "#1e56a0", color: "#1e56a0" }}
            >
              <Sparkles size={14} /> {hasWerdegang ? "Werdegang neu erstellen" : "Werdegang ergänzen"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: "#dde3ea", color: "#374151" }}
          >
            <Printer size={14} /> Drucken
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={pending || pdfPending}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <Download size={14} /> {pdfPending ? "PDF wird erstellt…" : "PDF herunterladen"}
          </button>
        </div>
      </div>
      {pending && (
        <p className="rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "#1e56a012", color: "#1e56a0" }}>
          {outdated
            ? "Die Angaben haben sich geändert – der Werdegang wird per KI neu erstellt (dauert etwa eine Minute)…"
            : "Werdegang wird per KI aus den Angaben formuliert und um typische Aufgaben des Berufsbilds ergänzt (dauert etwa eine Minute)…"}
        </p>
      )}
      {error && <p className="text-xs text-red-600">Werdegang konnte nicht ergänzt werden: {error}</p>}
      {pdfError && <p className="text-xs text-red-600">{pdfError}</p>}
    </div>
  )
}
