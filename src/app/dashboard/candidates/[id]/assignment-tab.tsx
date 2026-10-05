"use client"

import { useMemo } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import type { MapCircle, MapPoint } from "@/components/dashboard/matches-map"
import { haversineDistanceKm } from "@/lib/matching"
import { AssignmentControl, assignmentStatusLabel, type ActiveAssignment } from "./matches-section"
import type { ClientOption } from "./client-assignment-section"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"

export interface KanzleiCampaignOption {
  id: string
  title: string
  berufsbild: string | null
  clientId: string | null
  clientName: string
  lat: number | null
  lng: number | null
}

// Umkreis, in dem Kanzleien auf der Karte im Kandidaten gezeigt werden.
const NEARBY_KM = 50
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
// Kanzleien in der Nähe (Paket 13). Zugeordnet wird nur noch in der Kanzlei-Kampagne
// ("Passende Kandidaten"), "Weiterschieben" wurde entfernt.
export function AssignmentTab({
  candidateName,
  berufsbild,
  selfLat,
  selfLng,
  origin,
  activeAssignments,
  clients,
  kanzleiCampaigns,
}: {
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

  // Kanzleien (mit aktiven Kanzlei-Kampagnen) im Umkreis, je Kanzlei ein Punkt.
  const nearby = useMemo(() => {
    if (selfLat === null || selfLng === null) return []
    const byClient = new Map<string, { clientId: string; name: string; lat: number; lng: number; distanceKm: number; campaigns: KanzleiCampaignOption[] }>()
    for (const c of kanzleiCampaigns) {
      if (!c.clientId || c.lat === null || c.lng === null) continue
      const distanceKm = haversineDistanceKm(selfLat, selfLng, c.lat, c.lng)
      if (distanceKm > NEARBY_KM) continue
      const entry = byClient.get(c.clientId) ?? { clientId: c.clientId, name: c.clientName, lat: c.lat, lng: c.lng, distanceKm, campaigns: [] }
      entry.campaigns.push(c)
      entry.distanceKm = Math.min(entry.distanceKm, distanceKm)
      byClient.set(c.clientId, entry)
    }
    return [...byClient.values()].sort((a, b) => a.distanceKm - b.distanceKm)
  }, [kanzleiCampaigns, selfLat, selfLng])
  const fits = (k: (typeof nearby)[number]) => !!berufsbild && k.campaigns.some((c) => c.berufsbild === berufsbild)

  // Suchumkreis als Kreis, damit die Karte auch ohne Kanzlei in der Nähe sinnvoll zoomt.
  const circles: MapCircle[] = useMemo(
    () => (selfLat !== null && selfLng !== null ? [{ lat: selfLat, lng: selfLng, radiusKm: NEARBY_KM, label: `Umkreis ${NEARBY_KM} km`, color: "#94a3b8" }] : []),
    [selfLat, selfLng]
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

      <Section title={`Wohnort und Kanzleien im Umkreis von ${NEARBY_KM} km (${nearby.length})`}>
        {selfLat === null || selfLng === null ? (
          <p className="text-sm text-gray-400">Kein Wohnort bekannt – PLZ im Profil eintragen, dann erscheint die Karte.</p>
        ) : (
          <>
            <p className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MATCH_COLOR }} /> sucht {berufsbildLabel(berufsbild)}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: OTHER_COLOR }} /> andere Stelle</span>
            </p>
            <MatchesMap points={points} circles={circles} height="320px" fitCircles />
            {nearby.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-xs text-gray-600">
                {nearby.slice(0, 8).map((k) => (
                  <li key={k.clientId}>
                    <Link href={`/dashboard/clients/${k.clientId}`} className="font-medium hover:underline" style={{ color: fits(k) ? MATCH_COLOR : "#1e56a0" }}>
                      {k.name}
                    </Link>{" "}
                    – {Math.round(k.distanceKm)} km · {k.campaigns.map((c) => c.title).join(", ")}
                  </li>
                ))}
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
