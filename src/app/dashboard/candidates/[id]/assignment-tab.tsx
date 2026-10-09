"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import type { MapCircle, MapPoint } from "@/components/dashboard/matches-map"
import { haversineDistanceKm } from "@/lib/geo-distance"
import { AssignmentControl, assignmentStatusLabel, type ActiveAssignment } from "./matches-section"
import type { ClientOption } from "./client-assignment-section"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { assignCandidateToCampaignAction } from "../../campaigns/[id]/actions"

export interface KanzleiCampaignOption {
  id: string
  title: string
  berufsbild: string | null
  clientId: string | null
  clientName: string
  lat: number | null
  lng: number | null
  extraPoints?: { lat: number; lng: number }[]
}

// Umkreis, in dem Kanzleien im Kandidaten gezeigt werden - wählbar (Paket 43).
const RADIUS_OPTIONS = [10, 25, 50, 100]
const DEFAULT_RADIUS_KM = 25
const MATCH_COLOR = "#1a9a6a"
const OTHER_COLOR = "#9ca3af"

// Leaflet greift beim Import auf Browser-Globals zu - nur clientseitig laden.
const MatchesMap = dynamic(() => import("@/components/dashboard/matches-map").then((m) => m.MatchesMap), {
  ssr: false,
  loading: () => <div className="flex h-[320px] items-center justify-center rounded-lg border text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>Karte wird geladen…</div>,
})

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
// Leads, Zuordnungen zu Kanzlei-Kampagnen (1:n) und eine Karte mit Wohnort und den
// Kanzleien in der Nähe (Paket 13). Seit Paket 43 lassen sich die Kanzlei-Kampagnen im
// gewählten Umkreis hier auch direkt zuordnen (wie "Passende Kandidaten" in der Kampagne).
export function AssignmentTab({
  candidateId,
  candidateStatus,
  candidateName,
  berufsbild,
  selfLat,
  selfLng,
  origin,
  activeAssignments,
  clients,
  kanzleiCampaigns,
}: {
  candidateId: string
  candidateStatus: string
  candidateName: string
  berufsbild: string | null
  selfLat: number | null
  selfLng: number | null
  origin: Origin
  activeAssignments: ActiveAssignment[]
  clients: ClientOption[]
  kanzleiCampaigns: KanzleiCampaignOption[]
}) {
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Unbekannter Kunde"
  const router = useRouter()
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const assignable = candidateStatus === ASSIGNABLE_STATUS
  const assignedCampaignIds = new Set(activeAssignments.map((a) => a.campaignId).filter(Boolean))
  const assignedClientIds = new Set(activeAssignments.map((a) => a.clientId))

  async function assign(campaignId: string) {
    setAssigningId(campaignId)
    setAssignError(null)
    const res = await assignCandidateToCampaignAction(campaignId, candidateId)
    setAssigningId(null)
    if (res?.error) setAssignError(res.error)
    else router.refresh()
  }

  // Kanzleien (mit aktiven Kanzlei-Kampagnen) im Umkreis, je Kanzlei ein Punkt.
  const nearby = useMemo(() => {
    if (selfLat === null || selfLng === null) return []
    type Nearby = { clientId: string; name: string; lat: number; lng: number; distanceKm: number; campaigns: KanzleiCampaignOption[] }
    const byClient = new Map<string, Nearby>()
    // Je Kanzlei und Standort ein Punkt - zusammengeführte Kampagnen haben mehrere.
    for (const c of kanzleiCampaigns) {
      if (!c.clientId) continue
      const places = [...(c.lat !== null && c.lng !== null ? [{ lat: c.lat, lng: c.lng }] : []), ...(c.extraPoints ?? [])]
      for (const place of places) {
        const distanceKm = haversineDistanceKm(selfLat, selfLng, place.lat, place.lng)
        if (distanceKm > radiusKm) continue
        const key: string = `${c.clientId}:${place.lat},${place.lng}`
        const entry: Nearby = byClient.get(key) ?? { clientId: c.clientId, name: c.clientName, lat: place.lat, lng: place.lng, distanceKm, campaigns: [] }
        if (!entry.campaigns.includes(c)) entry.campaigns.push(c)
        byClient.set(key, entry)
      }
    }
    return [...byClient.values()].sort((a, b) => a.distanceKm - b.distanceKm)
  }, [kanzleiCampaigns, selfLat, selfLng, radiusKm])

  // Zuordenbare Kanzlei-Kampagnen im Umkreis (nächster Standort zählt), passendes
  // Berufsbild zuerst.
  const campaignRows = useMemo(() => {
    if (selfLat === null || selfLng === null) return []
    return kanzleiCampaigns
      .filter((c) => c.clientId)
      .map((c) => {
        const places = [...(c.lat !== null && c.lng !== null ? [{ lat: c.lat, lng: c.lng }] : []), ...(c.extraPoints ?? [])]
        const distanceKm = places.length ? Math.min(...places.map((p) => haversineDistanceKm(selfLat, selfLng, p.lat, p.lng))) : null
        return { campaign: c, distanceKm, fits: !!berufsbild && c.berufsbild === berufsbild }
      })
      .filter((r): r is typeof r & { distanceKm: number } => r.distanceKm !== null && r.distanceKm <= radiusKm)
      .sort((a, b) => Number(b.fits) - Number(a.fits) || a.distanceKm - b.distanceKm)
  }, [kanzleiCampaigns, selfLat, selfLng, radiusKm, berufsbild])
  const fits = (k: (typeof nearby)[number]) => !!berufsbild && k.campaigns.some((c) => c.berufsbild === berufsbild)

  // Suchumkreis als Kreis, damit die Karte auch ohne Kanzlei in der Nähe sinnvoll zoomt.
  const circles: MapCircle[] = useMemo(
    () => (selfLat !== null && selfLng !== null ? [{ lat: selfLat, lng: selfLng, radiusKm, label: `Umkreis ${radiusKm} km`, color: "#94a3b8" }] : []),
    [selfLat, selfLng, radiusKm]
  )
  const points: MapPoint[] = useMemo(() => [
    { lat: selfLat, lng: selfLng, label: candidateName, sublabel: "Wohnort (PLZ)", isSelf: true },
    ...nearby.map((k) => ({
      lat: k.lat,
      lng: k.lng,
      label: k.name,
      sublabel: `${Math.round(k.distanceKm)} km · ${k.campaigns.map((c) => c.title).join(", ")}`,
      href: `/dashboard/clients/${k.clientId}`,
      color: fits(k) ? MATCH_COLOR : OTHER_COLOR,
    })),
  ], [nearby, candidateName, selfLat, selfLng, berufsbild]) // eslint-disable-line react-hooks/exhaustive-deps

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

      <Section title={`Kanzleien im Umkreis (${campaignRows.length} Kampagnen)`}>
        {selfLat === null || selfLng === null ? (
          <p className="text-sm text-gray-400">Kein Wohnort bekannt – PLZ im Profil eintragen, dann erscheinen Karte und Kanzleien im Umkreis.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MATCH_COLOR }} /> sucht {berufsbildLabel(berufsbild)}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OTHER_COLOR }} /> andere Stelle</span>
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Umkreis
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  className="rounded-md border bg-white px-2 py-1 text-sm text-gray-700"
                  style={{ borderColor: "#dde3ea" }}
                >
                  {RADIUS_OPTIONS.map((km) => (
                    <option key={km} value={km}>
                      {km} km
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MatchesMap points={points} circles={circles} height="320px" fitCircles />

            {!assignable && (
              <p className="mt-3 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                Zuordnen ist nur bei vorqualifizierten Kandidaten möglich – bitte zuerst den Status auf „Vorqualifiziert“ setzen.
              </p>
            )}
            {assignError && <p className="mt-3 text-xs text-red-600">{assignError}</p>}

            {campaignRows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">Keine aktive Kanzlei-Kampagne im Umkreis von {radiusKm} km – Umkreis vergrößern.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {campaignRows.map(({ campaign: c, distanceKm, fits: match }) => {
                  const assignedHere = assignedCampaignIds.has(c.id)
                  const assignedToClient = !assignedHere && assignedClientIds.has(c.clientId!)
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3" style={{ borderColor: match ? `${MATCH_COLOR}66` : "#dde3ea" }}>
                      <div className="min-w-0">
                        <Link href={`/dashboard/clients/${c.clientId}`} className="block truncate text-sm font-medium hover:underline" style={{ color: match ? MATCH_COLOR : "#1e56a0" }}>
                          {c.clientName}
                        </Link>
                        <p className="truncate text-xs text-gray-500">
                          <Link href={`/dashboard/campaigns/${c.id}`} className="hover:underline">
                            {c.title}
                          </Link>{" "}
                          · {berufsbildLabel(c.berufsbild)} · {Math.round(distanceKm)} km
                        </p>
                      </div>
                      {assignedHere ? (
                        <span className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}>
                          Zugeordnet
                        </span>
                      ) : assignedToClient ? (
                        <span className="text-xs text-gray-400">Bereits über andere Kampagne zugeordnet</span>
                      ) : (
                        <button
                          type="button"
                          disabled={!assignable || assigningId !== null}
                          onClick={() => assign(c.id)}
                          className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          style={{ backgroundColor: "#1e56a0" }}
                        >
                          {assigningId === c.id ? "…" : "Zuordnen"}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
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
