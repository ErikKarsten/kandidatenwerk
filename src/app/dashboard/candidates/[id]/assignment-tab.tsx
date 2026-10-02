"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import dynamic from "next/dynamic"
import { assignToCampaignAction } from "./actions"
import { AssignmentControl, assignmentStatusLabel, type ActiveAssignment } from "./matches-section"
import type { ClientOption } from "./client-assignment-section"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import type { MapPoint } from "@/components/dashboard/matches-map"

// Leaflet greift beim Import auf Browser-Globals zu - nur clientseitig laden.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-lg border py-10 text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
      Karte wird geladen…
    </div>
  ),
})

export interface CampaignMatch {
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

export interface KanzleiCampaignOption {
  id: string
  title: string
  berufsbild: string | null
  clientId: string | null
  clientName: string
}

interface Origin {
  campaignId: string | null
  title: string | null
  kind: string | null
  clientId: string | null
  clientName: string | null
}

function berufsbildLabel(value: string | null): string {
  return BERUFSBILD_OPTIONS.find((o) => o.value === value)?.label ?? "ohne Berufsbild"
}

// Reiter "Zuordnung" im Kandidatenprofil (Atlas T-35, Zielbild T-31): Herkunft des
// Leads, Zuordnungen zu Kanzlei-Kampagnen (1:n), passende Kanzlei-Kampagnen aus dem
// Matching und "Weiterschieben" an beliebige weitere Kanzlei-Kampagnen.
export function AssignmentTab({
  candidateId,
  candidateName,
  berufsbild,
  selfLat,
  selfLng,
  origin,
  matches,
  activeAssignments,
  clients,
  kanzleiCampaigns,
}: {
  candidateId: string
  candidateName: string
  berufsbild: string | null
  selfLat: number | null
  selfLng: number | null
  origin: Origin
  matches: CampaignMatch[]
  activeAssignments: ActiveAssignment[]
  clients: ClientOption[]
  kanzleiCampaigns: KanzleiCampaignOption[]
}) {
  const assignedCampaignIds = new Set(activeAssignments.map((a) => a.campaignId).filter(Boolean) as string[])
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Unbekannter Kunde"

  const mapPoints: MapPoint[] = [
    { lat: selfLat, lng: selfLng, label: candidateName, isSelf: true },
    ...matches.map((m) => ({ lat: m.lat, lng: m.lng, label: m.campaignTitle, sublabel: m.clientName ?? undefined })),
  ]

  return (
    <div className="flex flex-col gap-6">
      <Section title="Herkunft">
        {origin.campaignId && origin.title ? (
          <p className="text-sm text-gray-700">
            Bewerbung über{" "}
            <Link href={`/dashboard/campaigns/${origin.campaignId}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
              {origin.title}
            </Link>
            {origin.kind === "lead" ? " (Lead-Kampagne)" : origin.clientName ? ` (${origin.clientName})` : ""}
          </p>
        ) : (
          <p className="text-sm text-gray-400">Keine Kampagne hinterlegt (manuell angelegt oder Altbestand).</p>
        )}
      </Section>

      <Section title={`Zugeordnet (${activeAssignments.length})`}>
        {activeAssignments.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keiner Kanzlei-Kampagne zugeordnet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {activeAssignments.map((a) => {
              const colors = assignmentStatusLabel(a.status)
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
                  <div className="min-w-0">
                    <Link href={`/dashboard/clients/${a.clientId}`} className="block truncate text-sm font-medium hover:underline" style={{ color: "#1e56a0" }}>
                      {clientName(a.clientId)}
                    </Link>
                    <p className="truncate text-xs text-gray-500">
                      {a.campaignTitle ?? "Kanzlei allgemein (ohne Kampagne)"} ·{" "}
                      <span style={{ color: colors.text }}>{colors.label}</span>
                    </p>
                  </div>
                  <AssignmentControl assignment={a} />
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      <Section title={`Passende Kanzlei-Kampagnen (${matches.length})`}>
        {!berufsbild && (
          <p className="mb-2 text-xs text-amber-700">Ohne Berufsbild findet das Matching keine Kampagnen – Berufsbild oben setzen.</p>
        )}
        <div className="mb-3">
          <MatchesMap points={mapPoints} />
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-gray-400">Keine passenden Kanzlei-Kampagnen im Umkreis.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {matches.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
                <div className="min-w-0">
                  <Link href={`/dashboard/campaigns/${m.campaignId}`} className="block truncate text-sm font-medium hover:underline" style={{ color: "#1e56a0" }}>
                    {m.campaignTitle}
                  </Link>
                  <p className="truncate text-xs text-gray-500">
                    {m.clientName ?? "Kein Kunde"} · {m.distanceKm !== null ? `${m.distanceKm.toFixed(1)} km` : "Entfernung unbekannt"}
                  </p>
                </div>
                <AssignButton candidateId={candidateId} campaignId={m.campaignId} assigned={assignedCampaignIds.has(m.campaignId)} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Weiterschieben an weitere Kanzlei-Kampagne">
        <PushForward
          candidateId={candidateId}
          berufsbild={berufsbild}
          kanzleiCampaigns={kanzleiCampaigns}
          assignedCampaignIds={assignedCampaignIds}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</p>
      {children}
    </section>
  )
}

function AssignButton({
  candidateId,
  campaignId,
  assigned,
  onAssigned,
}: {
  candidateId: string
  campaignId: string
  assigned: boolean
  onAssigned?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (assigned) {
    return <span className="text-xs font-medium" style={{ color: "#1a9a6a" }}>Zugeordnet</span>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null)
            const result = await assignToCampaignAction(candidateId, campaignId)
            if (result?.error) {
              setError(result.error)
              return
            }
            onAssigned?.()
            router.refresh()
          })
        }
        className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "#1e56a0" }}
      >
        {pending ? "…" : "Zuordnen"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function PushForward({
  candidateId,
  berufsbild,
  kanzleiCampaigns,
  assignedCampaignIds,
}: {
  candidateId: string
  berufsbild: string | null
  kanzleiCampaigns: KanzleiCampaignOption[]
  assignedCampaignIds: Set<string>
}) {
  const [onlySameBerufsbild, setOnlySameBerufsbild] = useState(!!berufsbild)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState("")

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return kanzleiCampaigns
      .filter((c) => !assignedCampaignIds.has(c.id))
      .filter((c) => !onlySameBerufsbild || !berufsbild || c.berufsbild === berufsbild)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.clientName.toLowerCase().includes(q))
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.title.localeCompare(b.title))
  }, [kanzleiCampaigns, assignedCampaignIds, onlySameBerufsbild, berufsbild, query])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kanzlei oder Kampagne suchen"
          className="min-w-[200px] flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
          style={{ borderColor: "#dde3ea" }}
        />
        {berufsbild && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={onlySameBerufsbild} onChange={(e) => setOnlySameBerufsbild(e.target.checked)} />
            nur {berufsbildLabel(berufsbild)}
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="min-w-[260px] flex-1 rounded-md border bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="">{options.length === 0 ? "Keine passende Kanzlei-Kampagne" : `Kanzlei-Kampagne wählen (${options.length})`}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.clientName} – {c.title} ({berufsbildLabel(c.berufsbild)})
            </option>
          ))}
        </select>
        {selected && (
          <AssignButton key={selected} candidateId={candidateId} campaignId={selected} assigned={false} onAssigned={() => setSelected("")} />
        )}
      </div>
    </div>
  )
}
