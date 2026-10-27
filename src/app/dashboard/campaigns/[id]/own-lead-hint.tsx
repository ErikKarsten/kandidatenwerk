"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { assignCandidateToCampaignAction } from "./actions"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"

// Lead aus der eigenen Meta-Kampagne der Kanzlei, noch nicht zugeordnet (Paket 93). Mit
// "vorqualifiziert" geht er automatisch an die Kanzlei. Den Knopf gibt es nur für die
// Ausnahme, dass ein Lead schon vorqualifiziert ist, ohne zugeordnet zu sein (z. B. Stand
// aus Leadtable übernommen oder die Kanzlei war beim Vorqualifizieren noch nicht live).
export function OwnLeadHint({ campaignId, candidateId, status, clientLive }: { campaignId: string; candidateId: string; status: string; clientLive: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (status === "abgelehnt") return null
  if (status !== ASSIGNABLE_STATUS) return <span className="mt-0.5 block text-[11px] text-gray-400">Noch nicht bei der Kanzlei</span>
  if (!clientLive) return <span className="mt-0.5 block text-[11px] text-amber-700">Kanzlei noch nicht live</span>

  function assign() {
    setError(null)
    startTransition(async () => {
      const res = await assignCandidateToCampaignAction(campaignId, candidateId)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <span className="mt-0.5 block text-[11px]">
      <button type="button" onClick={assign} disabled={pending} className="font-medium hover:underline disabled:opacity-50" style={{ color: "#1e56a0" }}>
        {pending ? "Wird zugeordnet…" : "An die Kanzlei geben"}
      </button>
      {error && <span className="block text-red-600">{error}</span>}
    </span>
  )
}
