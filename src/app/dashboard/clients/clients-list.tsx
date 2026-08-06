"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Search } from "lucide-react"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

const ARCHIVED_STATUS = "Archiviert"

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc"

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
]

export interface ClientListItem {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  active: boolean
  status: string
  logo_url: string | null
  created_at: string
  campaign_count: number
}

export function ClientsList({ clients }: { clients: ClientListItem[] }) {
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
    "clients_page_size"
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((client) => {
              const isArchived = client.status === ARCHIVED_STATUS
              return (
                <Link
                  key={client.id}
                  href={`/dashboard/clients/${client.id}`}
                  className="flex flex-col gap-4 rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
                  style={{ borderColor: "#dde3ea", opacity: isArchived ? 0.65 : 1 }}
                >
                  <div className="flex items-center gap-3">
                    {client.logo_url ? (
                      <img
                        src={client.logo_url}
                        alt={client.name}
                        className="h-10 w-10 shrink-0 rounded-lg border object-contain"
                        style={{ borderColor: "#dde3ea", backgroundColor: "#f8fafc" }}
                      />
                    ) : (
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                        style={{ backgroundColor: isArchived ? "#9ca3af" : "#1e56a0" }}
                      >
                        {getInitials(client.name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{client.name}</p>
                      {client.contact_name && (
                        <p className="truncate text-xs text-gray-500">{client.contact_name}</p>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 truncate">
                    {client.contact_email ?? <span className="text-gray-300">Keine E-Mail</span>}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: client.active ? "#1a9a6a18" : "#9ca3af18",
                          color: client.active ? "#1a9a6a" : "#6b7280",
                        }}
                      >
                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: client.active ? "#1a9a6a" : "#9ca3af" }} />
                        {client.active ? "Aktiv" : "Inaktiv"}
                      </span>
                      {isArchived && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: "#f59e0b18", color: "#b45309" }}
                        >
                          Archiviert
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">
                      {client.campaign_count} Kampagne{client.campaign_count !== 1 ? "n" : ""}
                    </span>
                  </div>
                </Link>
              )
            })}
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
