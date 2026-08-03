"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { ClientCard, type ClientCardProps } from "./client-card"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

export type ClientGridItem = ClientCardProps & { created_at: string }

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
]

export function ClientGrid({ clients }: { clients: ClientGridItem[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("alle")
  const [sortBy, setSortBy] = useState<SortOption>("newest")

  const filteredClients = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const filtered = clients.filter((c) => {
      if (statusFilter === "aktiv" && !c.active) return false
      if (statusFilter === "inaktiv" && c.active) return false
      if (query && !c.name.toLowerCase().includes(query)) return false
      return true
    })

    const sorted = [...filtered]
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "name-asc":
          return a.name.localeCompare(b.name, "de")
        case "name-desc":
          return b.name.localeCompare(a.name, "de")
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
    })
    return sorted
  }, [clients, searchQuery, statusFilter, sortBy])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filteredClients,
    "dashboard_clients_page_size"
  )

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setPage(1)
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function handleSortChange(value: string) {
    setSortBy(value as SortOption)
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
            placeholder="Name suchen…"
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
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Inaktiv</option>
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
          {filteredClients.length} von {clients.length} Kunde{clients.length !== 1 ? "n" : ""}
        </span>
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Kunden entsprechen den aktuellen Filtern.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((client) => (
              <Link
                key={client.id}
                href={`/dashboard/clients/${client.id}`}
                className="block rounded-xl transition-shadow hover:shadow-md"
              >
                <ClientCard {...client} />
              </Link>
            ))}
          </div>

          <PaginationBar
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={handlePageSize}
          />
        </>
      )}
    </div>
  )
}
