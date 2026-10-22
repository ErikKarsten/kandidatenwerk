"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Inbox } from "lucide-react"
import { assignCandidateToCampaignAction } from "./actions"
import { CANDIDATE_STATUS_FALLBACK_COLORS, CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { useBerufsbilder } from "@/components/berufsbild-context"

export interface OwnLead {
  id: string
  first_name: string
  last_name: string
  status: string
  berufsbild: string | null
  plz: string | null
  created_at: string
}

// Leads aus der eigenen Meta-Kampagne der Kanzlei (Paket 80), die noch nicht zugeordnet
// sind: erst vorqualifizieren, dann mit einem Klick dieser Kampagne zuordnen - erst dann
// sieht die Kanzlei sie im Portal. Nicht im Termin-Modus (der ist für die Kanzlei).
export function OwnLeadsSection({ campaignId, leads, clientLive }: { campaignId: string; leads: OwnLead[]; clientLive: boolean }) {
  const bb = useBerufsbilder()
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function assign(candidateId: string) {
    setPendingId(candidateId)
    setError(null)
    startTransition(async () => {
      const res = await assignCandidateToCampaignAction(campaignId, candidateId)
      setPendingId(null)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: "#fcd34d" }}>
      <div className="flex flex-col gap-0.5 border-b px-4 py-3" style={{ borderColor: "#fef3c7", backgroundColor: "#fffbeb" }}>
        <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
          <Inbox size={15} /> Neue Leads aus der eigenen Meta-Kampagne ({leads.length})
        </p>
        <p className="text-xs text-amber-800">
          Noch nicht bei der Kanzlei: erst vorqualifizieren (Status „Vorqualifiziert“), dann hier zuordnen.
          {!clientLive && " Zuordnen geht erst, wenn die Kanzlei live ist."}
        </p>
      </div>
      {error && <p className="px-4 pt-2 text-xs text-red-600">{error}</p>}
      <ul className="divide-y" style={{ borderColor: "#eef2f6" }}>
        {leads.map((l) => {
          const status = CANDIDATE_STATUS_OPTIONS.find((o) => o.value === l.status)
          const colors = status ?? CANDIDATE_STATUS_FALLBACK_COLORS
          const ready = l.status === ASSIGNABLE_STATUS && clientLive
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <Link href={`/dashboard/candidates/${l.id}`} className="text-sm font-medium hover:underline" style={{ color: "#1e56a0" }}>
                  {`${l.first_name} ${l.last_name}`.trim() || "Ohne Namen"}
                </Link>
                <p className="text-xs text-gray-400">
                  {[bb.label(l.berufsbild), l.plz ? `PLZ ${l.plz}` : null, `eingegangen ${new Date(l.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: colors.bg, color: colors.text }}>
                  {status?.label ?? l.status}
                </span>
                <button
                  type="button"
                  onClick={() => assign(l.id)}
                  disabled={!ready || pendingId === l.id}
                  title={ready ? undefined : clientLive ? "Erst vorqualifizieren" : "Kanzlei ist noch nicht live"}
                  className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
                  style={{ backgroundColor: "#1e56a0" }}
                >
                  {pendingId === l.id ? "…" : "Zuordnen"}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
