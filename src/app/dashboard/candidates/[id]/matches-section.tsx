"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { Building2 } from "lucide-react"
import { assignToClientAction, updateAssignmentStatusAction, removeClientAssignmentAction } from "./actions"
import { AddClientAssignmentButton, type ClientOption } from "./client-assignment-section"
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

// Deutsche Labels für die Stecktafel-Status-Pipeline (inbox/vq/vqk/vg/ja/nein), siehe
// CHECK-Constraint auf client_assignments.status - gleiche Liste wie zuvor in der
// entfernten ClientAssignmentSection.
const ASSIGNMENT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "inbox", label: "Unbearbeitet" },
  { value: "vq", label: "Vorqualifiziert" },
  { value: "vqk", label: "Vorqualifiziert beim Kunden" },
  { value: "vg", label: "Vorstellungsgespräch" },
  { value: "ja", label: "Ja" },
  { value: "nein", label: "Nein" },
]

export interface ActiveAssignment {
  id: string
  clientId: string
  status: string
}

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
  activeAssignments,
  clients,
  selfLat,
  selfLng,
  selfLabel,
}: {
  matches: CampaignMatch[]
  candidateId: string
  activeAssignments: ActiveAssignment[]
  clients: ClientOption[]
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Passende Kampagnen ({matches.length})
        </p>
        <AddClientAssignmentButton candidateId={candidateId} clients={clients} />
      </div>

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
              assignment={activeAssignments.find((a) => a.clientId === m.clientId) ?? null}
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
  assignment,
}: {
  match: CampaignMatch
  candidateId: string
  assignment: ActiveAssignment | null
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
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {colors.label}
          </span>
          {assignment ? (
            <AssignmentControl assignment={assignment} />
          ) : (
            match.clientId && (
              <button
                onClick={handleAssign}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
              >
                <Building2 size={12} />
                {pending ? "Wird zugeordnet…" : "Kanzlei zuordnen"}
              </button>
            )
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

// Kompakte Status-/Entfernen-Steuerung für eine bereits bestehende aktive Zuordnung zu
// genau diesem Kampagnen-Kunden - ersetzt an dieser Stelle den "Kanzlei zuordnen"-Knopf.
function AssignmentControl({ assignment }: { assignment: ActiveAssignment }) {
  const router = useRouter()
  const [statusPending, startStatusTransition] = useTransition()
  const [removeConfirm, setRemoveConfirm] = useState(false)
  const [removePending, startRemoveTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    setError(null)
    startStatusTransition(async () => {
      const result = await updateAssignmentStatusAction(assignment.id, newStatus)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  function handleRemove() {
    setError(null)
    startRemoveTransition(async () => {
      const result = await removeClientAssignmentAction(assignment.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-gray-400">Bereits zugeordnet</span>
      <select
        value={assignment.status}
        onChange={handleStatusChange}
        disabled={statusPending}
        className="rounded border px-1.5 py-0.5 text-xs focus:outline-none disabled:opacity-50"
        style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
      >
        {ASSIGNMENT_STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {removeConfirm ? (
        <span className="flex items-center gap-1">
          <button
            onClick={handleRemove}
            disabled={removePending}
            className="rounded px-1.5 py-0.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#dc2626" }}
          >
            Ja
          </button>
          <button
            onClick={() => setRemoveConfirm(false)}
            disabled={removePending}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
          >
            Nein
          </button>
        </span>
      ) : (
        <button
          onClick={() => setRemoveConfirm(true)}
          className="text-xs text-gray-400 hover:text-red-600"
        >
          Entfernen
        </button>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
