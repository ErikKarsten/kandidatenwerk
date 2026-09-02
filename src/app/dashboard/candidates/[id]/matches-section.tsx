"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Building2 } from "lucide-react"
import { assignToClientAction } from "./actions"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"
import type { MapPoint } from "@/components/dashboard/matches-map"

// Leaflet greift beim Modul-Import auf Browser-Globals zu - muss deshalb clientseitig-only
// geladen werden (ssr:false), sonst schlägt das Server-Rendering fehl.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-xl border bg-white py-12 text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
      Karte wird geladen…
    </div>
  ),
})

interface CampaignMatch {
  id: string
  campaignId: string
  campaignTitle: string
  clientId: string | null
  clientName: string | null
  distanceKm: number | null
  status: string
  matchedAt: string
  lat: number | null
  lng: number | null
}

export function MatchesSection({
  matches,
  candidateId,
  hasActiveAssignment,
  selfLat,
  selfLng,
  selfLabel,
}: {
  matches: CampaignMatch[]
  candidateId: string
  hasActiveAssignment: boolean
  selfLat: number | null
  selfLng: number | null
  selfLabel: string
}) {
  const mapPoints: MapPoint[] = [
    { lat: selfLat, lng: selfLng, label: selfLabel, isSelf: true },
    ...matches.map((m) => ({ lat: m.lat, lng: m.lng, label: m.campaignTitle, sublabel: m.clientName ?? undefined })),
  ]

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Passende Kampagnen ({matches.length})
      </p>

      <div className="mb-3">
        <MatchesMap points={mapPoints} />
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine passenden Kampagnen gefunden.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              candidateId={candidateId}
              canAssign={!hasActiveAssignment}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function statusLabel(status: string): { label: string; bg: string; text: string } {
  const opt = CANDIDATE_STATUS_OPTIONS.find((o) => o.value === status)
  return {
    label: opt?.label ?? status,
    bg: opt?.bg ?? CANDIDATE_STATUS_FALLBACK_COLORS.bg,
    text: opt?.text ?? CANDIDATE_STATUS_FALLBACK_COLORS.text,
  }
}

function MatchRow({
  match,
  candidateId,
  canAssign,
}: {
  match: CampaignMatch
  candidateId: string
  canAssign: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const colors = statusLabel(match.status)

  function handleAssign() {
    if (!match.clientId) return
    setMessage(null)
    startTransition(async () => {
      const result = await assignToClientAction(candidateId, match.clientId!)
      if (result?.error) {
        setMessage({ type: "error", text: result.error })
        return
      }
      setMessage({ type: "success", text: "Erfolgreich zugeordnet" })
      router.refresh()
    })
  }

  return (
    <li className="rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/dashboard/campaigns/${match.campaignId}`}
            className="block truncate text-sm font-medium hover:underline"
            style={{ color: "#1e56a0" }}
          >
            {match.campaignTitle}
          </Link>
          <p className="truncate text-xs text-gray-500">{match.clientName ?? "Kein Kunde"}</p>
        </div>
        <span className="shrink-0 text-xs text-gray-500">
          {match.distanceKm !== null ? `${match.distanceKm.toFixed(1)} km` : "—"}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {colors.label}
          </span>
          {canAssign && match.clientId && (
            <button
              onClick={handleAssign}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
            >
              <Building2 size={12} />
              {pending ? "Wird zugeordnet…" : "Kanzlei zuordnen"}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {new Date(match.matchedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
        </span>
      </div>
      {message && (
        <p className="mt-1.5 text-xs" style={{ color: message.type === "success" ? "#1a9a6a" : "#dc2626" }}>
          {message.text}
        </p>
      )}
    </li>
  )
}
