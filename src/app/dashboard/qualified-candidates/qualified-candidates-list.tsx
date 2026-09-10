"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"

const STATUS_LABEL = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o.label]))
const STATUS_COLORS = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o]))

export interface QualifiedRow {
  id: string
  full_name: string
  berufsbild: string | null
  status: string
  client_name: string | null
  qualifiedId: string
  addedAt: string
  criteriaReason: string | null
}

const COLUMN_COUNT = 5

export function QualifiedCandidatesList({ rows }: { rows: QualifiedRow[] }) {
  const [searchQuery, setSearchQuery] = useState("")

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return rows
    return rows.filter(
      (r) =>
        r.full_name.toLowerCase().includes(query) ||
        (r.client_name ?? "").toLowerCase().includes(query) ||
        (r.berufsbild ?? "").toLowerCase().includes(query)
    )
  }, [rows, searchQuery])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filtered,
    "qualified_candidates_page_size"
  )

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Name, Kunde oder Berufsbild suchen…"
            className="rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none"
            style={{ borderColor: "#dde3ea", minWidth: "220px" }}
          />
        </div>
        <span className="text-sm text-gray-500">
          {filtered.length} von {rows.length}
        </span>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Kandidat</TableHead>
              <TableHead className="text-gray-600">Berufsbild</TableHead>
              <TableHead className="text-gray-600">Kunde/Kampagne</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Aufgenommen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-12 text-center text-gray-400">
                  {rows.length === 0
                    ? "Noch keine qualifizierten Kandidaten. Die Liste füllt sich automatisch, sobald Kandidaten die Kriterien erfüllen."
                    : "Keine Kandidaten entsprechen der Suche."}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => {
                const colors = STATUS_COLORS[r.status] ?? CANDIDATE_STATUS_FALLBACK_COLORS
                return (
                  <TableRow key={r.qualifiedId} style={{ borderColor: "#dde3ea" }}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/candidates/${r.id}`}
                        className="hover:underline"
                        style={{ color: "#1e56a0" }}
                      >
                        {r.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-gray-600">{r.berufsbild ?? "—"}</TableCell>
                    <TableCell className="text-gray-600">{r.client_name ?? "—"}</TableCell>
                    <TableCell>
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                        {STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm" title={r.criteriaReason ?? undefined}>
                      {new Date(r.addedAt).toLocaleDateString("de-DE", {
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
  )
}
