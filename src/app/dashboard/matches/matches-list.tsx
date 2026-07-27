"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"
import { MatchStatusSelect } from "@/components/dashboard/match-status-select"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

type OneOrMany<T> = T | T[] | null

function first<T>(value: OneOrMany<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export interface MatchListItem {
  id: string
  distance_km: number | null
  status: string
  matched_at: string
  candidates: OneOrMany<{ id: string; first_name: string; last_name: string }>
  campaigns: OneOrMany<{
    id: string
    title: string
    clients: OneOrMany<{ id: string; name: string }>
  }>
}

const COLUMN_COUNT = 6

export function MatchesList({ matches }: { matches: MatchListItem[] }) {
  const [statusFilter, setStatusFilter] = useState<string>("alle")

  const filtered = useMemo(
    () => (statusFilter === "alle" ? matches : matches.filter((m) => m.status === statusFilter)),
    [matches, statusFilter]
  )

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filtered,
    "matches_page_size"
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="match-status-filter" className="text-sm text-gray-600">
          Status:
        </label>
        <select
          id="match-status-filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            setPage(1)
          }}
          className="rounded-md border px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="alle">Alle</option>
          {CANDIDATE_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {matches.length === 0 ? (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
          <Table>
            <TableHeader>
              <TableRow style={{ borderColor: "#dde3ea" }}>
                <TableHead className="text-gray-600">Kandidat</TableHead>
                <TableHead className="text-gray-600">Kampagne</TableHead>
                <TableHead className="text-gray-600">Kunde</TableHead>
                <TableHead className="text-gray-600">Entfernung</TableHead>
                <TableHead className="text-gray-600">Status</TableHead>
                <TableHead className="text-gray-600">Datum</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-12 text-center text-gray-400">
                  Noch keine Matches vorhanden.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "#dde3ea" }}>
                  <TableHead className="text-gray-600">Kandidat</TableHead>
                  <TableHead className="text-gray-600">Kampagne</TableHead>
                  <TableHead className="text-gray-600">Kunde</TableHead>
                  <TableHead className="text-gray-600">Entfernung</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                  <TableHead className="text-gray-600">Datum</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={COLUMN_COUNT} className="py-12 text-center text-gray-400">
                      Keine Matches mit diesem Status.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((m) => {
                    const candidate = first(m.candidates)
                    const campaign = first(m.campaigns)
                    const client = campaign ? first(campaign.clients) : null

                    return (
                      <TableRow key={m.id} style={{ borderColor: "#dde3ea" }}>
                        <TableCell className="font-medium">
                          {candidate ? (
                            <Link
                              href={`/dashboard/candidates/${candidate.id}`}
                              className="hover:underline"
                              style={{ color: "#1e56a0" }}
                            >
                              {candidate.first_name} {candidate.last_name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {campaign ? (
                            <Link
                              href={`/dashboard/campaigns/${campaign.id}`}
                              className="hover:underline"
                              style={{ color: "#1e56a0" }}
                            >
                              {campaign.title}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-gray-600">{client?.name ?? "—"}</TableCell>
                        <TableCell className="text-gray-600">
                          {m.distance_km !== null ? `${m.distance_km.toFixed(1)} km` : "—"}
                        </TableCell>
                        <TableCell>
                          <MatchStatusSelect matchId={m.id} currentStatus={m.status} />
                        </TableCell>
                        <TableCell className="text-gray-500 text-sm">
                          {new Date(m.matched_at).toLocaleDateString("de-DE", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={handlePageSize}
          />
        </div>
      )}
    </div>
  )
}
