"use client"

import { useEffect } from "react"

// Fehler beim Laden einer Dashboard-Seite (Paket 41): statt hängender oder leerer Seite
// ein Hinweis mit "Erneut versuchen" - Seitenleiste und Navigation bleiben nutzbar.
export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
      <h2 className="text-base font-semibold text-gray-900">Die Seite konnte nicht geladen werden</h2>
      <p className="text-sm text-gray-600">Meist hilft es, es einfach noch einmal zu versuchen.</p>
      {error.digest && <p className="text-xs text-gray-400">Fehler-ID: {error.digest}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
          Erneut versuchen
        </button>
        <button type="button" onClick={() => window.location.reload()} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50" style={{ borderColor: "#dde3ea" }}>
          Seite neu laden
        </button>
      </div>
    </div>
  )
}
