"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
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
import { PaginationBar, readStoredPageSize, type PageSize } from "@/components/ui/pagination-bar"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"
import { SOURCE_OPTIONS } from "@/lib/candidate-source"

const STATUS_LABEL = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o.label]))
const STATUS_COLORS = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o]))

export type CandidatesSortOption = "newest" | "oldest" | "name-asc" | "name-desc"

const SORT_OPTIONS: { value: CandidatesSortOption; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
]

const SEARCH_DEBOUNCE_MS = 300

export interface CandidateListItem {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
  berufsbild: string | null
  source: string
  created_at: string
  custom_fields: Record<string, string> | null
  campaigns: {
    id: string
    title: string
    clients: { id: string; name: string } | null
  } | null
}

interface CandidatesListProps {
  candidates: CandidateListItem[]
  showArchived?: boolean
  trulyEmpty: boolean
  totalCount: number
  page: number
  totalPages: number
  pageSize: PageSize
  search: string
  statusFilter: string
  berufsbildFilter: string
  sourceFilter: string
  sort: CandidatesSortOption
}

// Suche/Filter/Sortierung/Pagination laufen über URL-Suchparameter statt lokalem
// Client-State (siehe Performance-Review 09.09.2026, Punkt 3 - gleiches Muster wie bei
// der Kunden-Übersicht). Die Suchbox bleibt bewusst mit einem lokalen State entkoppelt
// (debounced), damit Tippen nicht bei jedem Zeichen eine Navigation auslöst.
export function CandidatesList({
  candidates,
  showArchived = false,
  trulyEmpty,
  totalCount,
  page,
  totalPages,
  pageSize,
  search,
  statusFilter,
  berufsbildFilter,
  sourceFilter,
  sort,
}: CandidatesListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // "Zustand waehrend des Renderns anpassen"-Muster statt useEffect (siehe React-Doku)
  // - synchronisiert searchInput nur bei EXTERNEN Aenderungen von `search` (z.B.
  // Browser-Zurueck), ohne den fuer setState-in-Effect ueblichen Extra-Render-Zyklus.
  const [prevSearch, setPrevSearch] = useState(search)
  const [searchInput, setSearchInput] = useState(search)
  if (search !== prevSearch) {
    setPrevSearch(search)
    setSearchInput(search)
  }

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") params.delete(key)
      else params.set(key, value)
    }
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  // Erster Seitenaufruf ohne pageSize-Parameter in der URL -> gespeicherte
  // Präferenz aus localStorage übernehmen (gleiches Verhalten wie vorher über
  // usePaginatedList/readStoredPageSize, jetzt als URL-Param statt reinem
  // Client-State).
  useEffect(() => {
    if (searchParams.get("pageSize")) return
    const stored = readStoredPageSize("candidates_page_size")
    if (stored !== pageSize) {
      updateParams({ pageSize: String(stored) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const handle = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ q: searchInput || null, page: null })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput])

  function handleStatusFilterChange(value: string) {
    updateParams({ status: value === "alle" ? null : value, page: null })
  }

  function handleBerufsbildFilterChange(value: string) {
    updateParams({ berufsbild: value === "alle" ? null : value, page: null })
  }

  function handleSourceFilterChange(value: string) {
    updateParams({ source: value === "alle" ? null : value, page: null })
  }

  function handleSortChange(value: string) {
    updateParams({ sort: value === "newest" ? null : value, page: null })
  }

  function handlePageChange(p: number) {
    updateParams({ page: p === 1 ? null : String(p) })
  }

  function handlePageSizeChange(size: PageSize) {
    window.localStorage.setItem("candidates_page_size", String(size))
    updateParams({ pageSize: size === 10 ? null : String(size), page: null })
  }

  if (trulyEmpty) {
    return (
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Name</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Erstellt am</TableHead>
              <TableHead className="text-gray-600">Ausbildung</TableHead>
              <TableHead className="text-gray-600">Kampagne</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-gray-400">
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
          value={sourceFilter}
          onChange={(e) => handleSourceFilterChange(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none"
          style={{ borderColor: "#dde3ea" }}
        >
          <option value="alle">Alle Herkünfte</option>
          {SOURCE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={sort}
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
          {totalCount} Kandidat{totalCount !== 1 ? "en" : ""}
        </span>
      </div>

      {candidates.length === 0 ? (
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
                  <TableHead className="text-gray-600">E-Mail</TableHead>
                  <TableHead className="text-gray-600">Erstellt am</TableHead>
                  <TableHead className="text-gray-600">Ausbildung</TableHead>
                  <TableHead className="text-gray-600">Kampagne</TableHead>
                  <TableHead className="text-gray-600">Kunde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => {
                  const colors = STATUS_COLORS[c.status] ?? CANDIDATE_STATUS_FALLBACK_COLORS
                  const campaign = c.campaigns
                  const client = campaign?.clients ?? null
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
                        {c.email ? (
                          <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.email}</a>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(c.created_at).toLocaleDateString("de-DE", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {c.custom_fields?.ausbildung ?? "—"}
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
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}
    </div>
  )
}
