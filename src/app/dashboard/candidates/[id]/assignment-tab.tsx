"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import dynamic from "next/dynamic"
import type { MapCircle, MapPoint } from "@/components/dashboard/matches-map"
import { AssignmentControl, assignmentStatusLabel, type ActiveAssignment } from "./matches-section"
import type { ClientOption } from "./client-assignment-section"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { ASSIGNABLE_STATUS } from "@/lib/client-assignment"
import { assignCandidateToCampaignAction } from "../../campaigns/[id]/actions"
import { assignCandidateToClientAction } from "./actions"
import { kanzleiDistanceKm, type KanzleiOption } from "@/lib/kanzlei-umkreis"

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

// Reiter "Zuordnung" im Kandidatenprofil (Atlas T-35, Zielbild T-31): Herkunft des
// Leads, Zuordnungen zu Kanzlei-Kampagnen (1:n) und eine Karte mit Wohnort und den
// Kanzleien in der Nähe (Paket 13). Seit Paket 46 alle Kanzleien im gewählten Umkreis -
// auch ohne Kanzlei-Kampagne - mit ihren gesuchten Stellen (aufklappbar mit Stellenprofil)
// und direkter Zuordnung.
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
  kanzleien,
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
  // Alle Kanzleien mit Standorten und gesuchten Stellen (Paket 46).
  kanzleien: KanzleiOption[]
}) {
  const bb = useBerufsbilder()
  const berufsbildLabel = (value: string | null) => bb.label(value) ?? "ohne Berufsbild"
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? "Unbekannter Kunde"
  const router = useRouter()
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const assignable = candidateStatus === ASSIGNABLE_STATUS

  // Zuordnen: über die passende Kanzlei-Kampagne, sonst an die Kanzlei allgemein (Paket 46).
  async function assign(clientId: string, campaignId: string | null) {
    setAssigningId(clientId)
    setAssignError(null)
    const res = campaignId ? await assignCandidateToCampaignAction(campaignId, candidateId) : await assignCandidateToClientAction(candidateId, clientId)
    setAssigningId(null)
    if (res?.error) setAssignError(res.error)
    else router.refresh()
  }

  // Kanzleien im Umkreis (nächster Standort zählt) - auch ohne Kanzlei-Kampagne. Kanzleien
  // mit einer Stelle oder Kampagne im Berufsbild des Kandidaten zuerst.
  const rows = useMemo(() => {
    if (selfLat === null || selfLng === null) return []
    return kanzleien
      .map((k) => {
        const campaigns = kanzleiCampaigns.filter((c) => c.clientId === k.id)
        const distanceKm = kanzleiDistanceKm(
          { places: [...k.places, ...campaigns.flatMap((c) => [...(c.lat !== null && c.lng !== null ? [{ lat: c.lat, lng: c.lng }] : []), ...(c.extraPoints ?? [])])] },
          selfLat,
          selfLng
        )
        const fits = !!berufsbild && (k.positions.some((p) => p.berufsbild === berufsbild) || campaigns.some((c) => c.berufsbild === berufsbild))
        // Zielkampagne: passendes Berufsbild, sonst die einzige aktive Kampagne.
        const target = campaigns.find((c) => c.berufsbild === berufsbild) ?? (campaigns.length === 1 ? campaigns[0] : null)
        return { kanzlei: k, campaigns, distanceKm, fits, target }
      })
      .filter((r): r is typeof r & { distanceKm: number } => r.distanceKm !== null && r.distanceKm <= radiusKm)
      .sort((a, b) => Number(b.fits) - Number(a.fits) || a.distanceKm - b.distanceKm)
  }, [kanzleien, kanzleiCampaigns, selfLat, selfLng, radiusKm, berufsbild])

  // Suchumkreis als Kreis, damit die Karte auch ohne Kanzlei in der Nähe sinnvoll zoomt.
  const circles: MapCircle[] = useMemo(
    () => (selfLat !== null && selfLng !== null ? [{ lat: selfLat, lng: selfLng, radiusKm, label: `Umkreis ${radiusKm} km`, color: "#94a3b8" }] : []),
    [selfLat, selfLng, radiusKm]
  )
  const points: MapPoint[] = useMemo(
    () => [
      { lat: selfLat, lng: selfLng, label: candidateName, sublabel: "Wohnort (PLZ)", isSelf: true },
      ...rows.flatMap((r) =>
        r.kanzlei.places.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          label: r.kanzlei.name,
          sublabel: `${Math.round(r.distanceKm)} km · ${r.kanzlei.positions.map((x) => x.title).join(", ") || "keine Stelle hinterlegt"}`,
          href: `/dashboard/clients/${r.kanzlei.id}`,
          color: r.fits ? MATCH_COLOR : OTHER_COLOR,
        }))
      ),
    ],
    [rows, candidateName, selfLat, selfLng]
  )

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

      <Section title={`Kanzleien im Umkreis (${rows.length})`}>
        {selfLat === null || selfLng === null ? (
          <p className="text-sm text-gray-400">Kein Wohnort bekannt – PLZ im Profil eintragen, dann erscheinen Karte und Kanzleien im Umkreis.</p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <p className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MATCH_COLOR }} /> sucht {berufsbildLabel(berufsbild)}</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OTHER_COLOR }} /> andere Stellen</span>
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

            {rows.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">Keine Kanzlei im Umkreis von {radiusKm} km – Umkreis vergrößern.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {rows.map(({ kanzlei: k, campaigns, distanceKm, fits, target }) => {
                  const assigned = activeAssignments.find((a) => a.clientId === k.id)
                  return (
                    <li key={k.id} className="rounded-lg border p-3" style={{ borderColor: fits ? `${MATCH_COLOR}66` : "#dde3ea" }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/dashboard/clients/${k.id}`} className="block truncate text-sm font-medium hover:underline" style={{ color: fits ? MATCH_COLOR : "#1e56a0" }}>
                            {k.name}
                          </Link>
                          <p className="text-xs text-gray-500">
                            {Math.round(distanceKm)} km{k.ort ? ` · ${k.ort}` : ""}
                            {campaigns.length > 0 && ` · Kampagne: ${campaigns.map((c) => c.title).join(", ")}`}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-700">
                            {k.positions.length > 0 ? (
                              <>
                                Sucht:{" "}
                                {k.positions.map((p, i) => (
                                  <span key={p.id} style={{ color: p.berufsbild === berufsbild ? MATCH_COLOR : undefined, fontWeight: p.berufsbild === berufsbild ? 600 : undefined }}>
                                    {i > 0 && ", "}
                                    {p.title}
                                  </span>
                                ))}
                              </>
                            ) : (
                              <span className="text-gray-400">Keine Stelle im Projekt hinterlegt</span>
                            )}
                          </p>
                        </div>
                        {assigned ? (
                          <span className="rounded-md px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}>
                            Zugeordnet{assigned.campaignTitle ? ` (${assigned.campaignTitle})` : ""}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={!assignable || assigningId !== null}
                            onClick={() => assign(k.id, target?.id ?? null)}
                            title={target ? `Über Kampagne „${target.title}“` : "Ohne Kampagne (Kanzlei allgemein)"}
                            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            style={{ backgroundColor: "#1e56a0" }}
                          >
                            {assigningId === k.id ? "…" : "Zuordnen"}
                          </button>
                        )}
                      </div>
                      {k.positions.length > 0 && (
                        <details className="mt-2 group">
                          <summary className="cursor-pointer select-none text-xs font-medium text-gray-500 hover:text-gray-800">
                            Stellenprofil{k.positions.length > 1 ? "e" : ""} anzeigen
                          </summary>
                          <div className="mt-2 flex flex-col gap-3">
                            {k.positions.map((p) => (
                              <div key={p.id} className="rounded-md border px-3 py-2" style={{ borderColor: "#eef2f6", backgroundColor: "#f8fafc" }}>
                                <p className="text-sm font-medium text-gray-900">
                                  {p.title}
                                  <span className="ml-2 text-xs font-normal text-gray-500">
                                    {[berufsbildLabel(p.berufsbild), p.ort].filter(Boolean).join(" · ")}
                                  </span>
                                </p>
                                {p.details.length > 0 ? (
                                  <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
                                    {p.details.map((d) => (
                                      <div key={d.label} className="contents">
                                        <dt className="text-gray-500">{d.label}</dt>
                                        <dd className="whitespace-pre-wrap text-gray-800">{d.value}</dd>
                                      </div>
                                    ))}
                                  </dl>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-400">Noch keine Angaben im Stellenprofil.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </details>
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
