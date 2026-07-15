import Link from "next/link"
import { MatchStatusSelect } from "@/components/dashboard/match-status-select"

interface CampaignMatch {
  id: string
  campaignId: string
  campaignTitle: string
  clientName: string | null
  distanceKm: number | null
  status: string
  matchedAt: string
}

export function MatchesSection({ matches }: { matches: CampaignMatch[] }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Passende Kampagnen ({matches.length})
      </p>
      {matches.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine passenden Kampagnen gefunden.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li key={m.id} className="rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/campaigns/${m.campaignId}`}
                    className="block truncate text-sm font-medium hover:underline"
                    style={{ color: "#1e56a0" }}
                  >
                    {m.campaignTitle}
                  </Link>
                  <p className="truncate text-xs text-gray-500">{m.clientName ?? "Kein Kunde"}</p>
                </div>
                <span className="shrink-0 text-xs text-gray-500">
                  {m.distanceKm !== null ? `${m.distanceKm.toFixed(1)} km` : "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <MatchStatusSelect matchId={m.id} currentStatus={m.status} />
                <span className="text-xs text-gray-400">
                  {new Date(m.matchedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
