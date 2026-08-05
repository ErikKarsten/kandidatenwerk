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
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"

const STATUS_LABEL = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o.label]))
const STATUS_COLORS = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o]))

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
]

export interface CandidateListItem {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  berufsbild: string | null
  created_at: string
  campaigns: {
    id: string
    title: string
    clients: { id: string; name: string } | { id: string; name: string }[] | null
  } | {
    id: string
    title: string
    clients: { id: string; name: string } | { id: string; name: string }[] | null
  }[] | null
}

export function CandidatesList({ candidates, showArchived = false }: { candidates: CandidateListItem[]; showArchived?: boolean }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("alle")
  const [berufsbildFilter, setBerufsbildFilter] = useState("alle")
  const [sortBy, setSortBy] = useState<SortOption>("newest")

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = candidates.filter((c) => {
      if (statusFilter !== "alle" && c.status !== statusFilter) return false
      if (berufsbildFilter !== "alle" && c.berufsbild !== berufsbildFilter) return false
      if (query) {
        const name = `${c.first_name} ${c.last_name}`.toLowerCase()
        const email = (c.email ?? "").toLowerCase()
        if (!name.includes(query) && !email.includes(query)) return false
      }
      return true
    })

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "de")
        case "name-desc":
          return `${b.first_name} ${b.last_name}`.localeCompare(`${a.first_name} ${a.last_name}`, "de")
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
    return sorted
  }, [candidates, searchQuery, statusFilter, berufsbildFilter, sortBy])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filteredCandidates,
    "candidates_page_size"
  )

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setPage(1)
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleBerufsbildFilterChange(value: string) {
    setBerufsbildFilter(value)
    setPage(1)
  }

  function handleSortChange(value: string) {
    setSortBy(value as SortOption)
    setPage(1)
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Name</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Kampagne</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Erstellt am</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={6} className="py-12 text-center text-gray-400">
                {showArchived ? "Keine archivierten Kandidaten vorhanden." : "Noch keine Kandidaten vorhanden."}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    )
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
            placeholder="Name oder E-Mail suchen…"
            className="rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none"
            style={{ borderColor: "#dde3ea", minWidth: "220px" }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="alle">Alle Status</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={berufsbildFilter}
          onChange={(e) => handleBerufsbildFilterChange(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="alle">Alle Berufsbilder</option>
          {BERUFSBILD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => handleSortChange(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none"
          style={{ borderColor: "#dde3ea" }}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filteredCandidates.length} von {candidates.length} Kandidat{candidates.length !== 1 ? "en" : ""}
        </span>
      </div>

      {filteredCandidates.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Kandidaten entsprechen den aktuellen Filtern.
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "#dde3ea" }}>
                  <TableHead className="text-gray-600">Name</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                  <TableHead className="text-gray-600">Kampagne</TableHead>
                  <TableHead className="text-gray-600">Kunde</TableHead>
                  <TableHead className="text-gray-600">E-Mail</TableHead>
                  <TableHead className="text-gray-600">Erstellt am</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const colors = STATUS_COLORS[c.status] ?? CANDIDATE_STATUS_FALLBACK_COLORS
                  const campaign = Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns as { id: string; title: string; clients: { id: string; name: string } | null } | null
                  const client = campaign ? (Array.isArray(campaign.clients) ? campaign.clients[0] : campaign.clients) : null
                  return (
                    <TableRow key={c.id} style={{ borderColor: "#dde3ea" }}>
                      <TableCell className="font-medium">
                        <Link href={`/dashboard/candidates/${c.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                          {c.first_name} {c.last_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                          {STATUS_LABEL[c.status] ?? c.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {campaign ? (
                          <Link href={`/dashboard/campaigns/${campaign.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                            {campaign.title}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {client ? (
                          <Link href={`/dashboard/clients/${client.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                            {client.name}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.email}</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(c.created_at).toLocaleDateString("de-DE", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                        })}
                      </TableCell>
                    </TableRow>
                  )
                })}
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
