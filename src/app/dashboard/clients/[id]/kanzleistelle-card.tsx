"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Globe } from "lucide-react"
import { publishClientToKanzleistelleAction } from "./actions"

export interface KanzleistelleStatus {
  published: boolean
  syncedAt: string | null
  error: string | null
  finalized: boolean
  jobCount: number
}

// Kanzleistelle24 (Paket 16, T-52): Erstes Veröffentlichen per Knopf, sobald das
// Kanzleiprofil abgeschlossen ist - danach gehen Änderungen an Profil, Stellen,
// Standorten und Logo automatisch raus. "Jetzt aktualisieren" stößt es von Hand an.
export function KanzleistelleCard({ clientId, status }: { clientId: string; status: KanzleistelleStatus }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function handleClick() {
    setMessage(null)
    startTransition(async () => {
      const result = await publishClientToKanzleistelleAction(clientId)
      if (!result.success) {
        setMessage({ ok: false, text: result.error })
      } else {
        const parts = [result.created > 0 && `${result.created} Stelle(n) neu`, result.updated > 0 && `${result.updated} aktualisiert`].filter(Boolean)
        setMessage({ ok: true, text: `${result.firstPublish ? "Veröffentlicht" : "Übertragen"}${parts.length ? `: ${parts.join(", ")}` : ""}.` })
      }
      router.refresh()
    })
  }

  const statusText = !status.published
    ? status.finalized
      ? "Noch nicht veröffentlicht."
      : "Erst möglich, wenn das Kanzleiprofil abgeschlossen ist."
    : `Veröffentlicht mit ${status.jobCount} Stelle(n) – Änderungen werden automatisch übertragen${
        status.syncedAt ? ` (zuletzt ${new Date(status.syncedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })})` : ""
      }.`

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-5 py-4" style={{ borderColor: "#dde3ea" }}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">Kanzleistelle24</p>
        <p className="text-xs text-gray-500">{statusText}</p>
        {status.error && !message && (
          <p className="mt-1 text-xs" style={{ color: "#dc2626" }}>
            Letzte Übertragung fehlgeschlagen: {status.error}
          </p>
        )}
        {message && (
          <p className="mt-1 text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>
            {message.text}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || !status.finalized}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
        style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
      >
        <Globe size={12} className={pending ? "animate-spin" : undefined} />
        {pending ? "Wird übertragen…" : status.published ? "Jetzt aktualisieren" : "Auf Kanzleistelle24 veröffentlichen"}
      </button>
    </div>
  )
}
