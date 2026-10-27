"use client"

import { useState, useTransition } from "react"
import { PhoneCall } from "lucide-react"
import { startCandidateCallAction } from "@/app/dashboard/telefonie-actions"

// "Anrufen" über sipgate (Paket 92): erst klingelt das eigene sipgate-Telefon, nach dem
// Abnehmen wählt sipgate den Kandidaten. Der Anruf landet nach dem Auflegen im Verlauf.
export function CallButton({ candidateId, compact = false }: { candidateId: string; compact?: boolean }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  function call() {
    setMessage(null)
    startTransition(async () => {
      const res = await startCandidateCallAction(candidateId)
      setMessage(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error })
      if (res.ok) setTimeout(() => setMessage(null), 8000)
    })
  }

  return (
    <span className="relative inline-flex flex-col">
      <button
        type="button"
        onClick={call}
        disabled={pending}
        title="Über sipgate anrufen"
        className={`inline-flex items-center justify-center gap-1.5 rounded-md border bg-white font-medium hover:bg-gray-50 disabled:opacity-50 ${compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"}`}
        style={{ borderColor: "#dde3ea", color: "#1a9a6a" }}
      >
        <PhoneCall size={compact ? 12 : 14} /> {pending ? "Verbindet…" : "Anrufen"}
      </button>
      {message && (
        <span
          role="status"
          className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border px-2.5 py-1.5 text-xs shadow-sm"
          style={message.ok ? { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4", color: "#15803d" } : { borderColor: "#fecaca", backgroundColor: "#fef2f2", color: "#b91c1c" }}
        >
          {message.text}
        </span>
      )}
    </span>
  )
}
