import Link from "next/link"
import { MatchStatusSelect } from "@/components/dashboard/match-status-select"

interface CandidateMatch {
  id: string
  candidateId: string
  firstName: string
  lastName: string
  distanceKm: number | null
  status: string
  matchedAt: string
}

export function MatchesTab({ matches }: { matches: CandidateMatch[] }) {
  if (matches.length === 0) {
    return (
      <div
        className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400"
        style={{ borderColor: "#dde3ea" }}
      >
        Noch keine passenden Kandidaten gefunden.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #dde3ea" }}>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Kandidat</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Entfernung</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Status</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Gematcht am</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => (
            <tr key={m.id} style={{ borderBottom: i < matches.length - 1 ? "1px solid #dde3ea" : undefined }}>
              <td className="px-4 py-2.5 font-medium">
                <Link href={`/dashboard/candidates/${m.candidateId}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                  {m.firstName} {m.lastName}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {m.distanceKm !== null ? `${m.distanceKm.toFixed(1)} km` : "—"}
              </td>
              <td className="px-4 py-2.5">
                <MatchStatusSelect matchId={m.id} currentStatus={m.status} />
              </td>
              <td className="px-4 py-2.5 text-gray-500">
                {new Date(m.matchedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
