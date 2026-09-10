"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Search } from "lucide-react"
import { PaginationBar, readStoredPageSize, type PageSize } from "@/components/ui/pagination-bar"
import { ClientCard, type ClientCardProps } from "@/components/dashboard/client-card"

export type ClientsSortOption = "newest" | "oldest" | "name-asc" | "name-desc"
export type ClientsStatusFilter = "alle" | "aktiv" | "inaktiv"

const SORT_OPTIONS: { value: ClientsSortOption; label: string }[] = [
  { value: "newest", label: "Neueste zuerst" },
  { value: "oldest", label: "Älteste zuerst" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
]

const SEARCH_DEBOUNCE_MS = 300

// ClientCardProps liefert bereits id/name/active/tags/stats/pipeline - created_at wird
// zusätzlich fürs Sortieren gebraucht, contact_name/contact_email/logo_url/status
// kommen weiterhin aus der Query in page.tsx mit (auch wenn ClientCard selbst sie
// aktuell nicht darstellt), damit an dieser Stelle nichts an Daten verloren geht.
export interface ClientListItem extends ClientCardProps {
  created_at: string
  contact_name: string | null
  contact_email: string | null
  logo_url: string | null
  status: string
}

interface ClientsListProps {
  clients: ClientListItem[]
  totalCount: number
  page: number
  totalPages: number
  pageSize: PageSize
  search: string
  statusFilter: ClientsStatusFilter
  sort: ClientsSortOption
}

// Suche/Filter/Sortierung/Pagination laufen jetzt über URL-Suchparameter statt über
// lokalen Client-State (siehe Performance-Review 09.09.2026, Punkt 2/4) - jede
// Änderung löst eine neue Anfrage an den Server aus (echtes serverseitiges Pagination
// statt eines bereits komplett geladenen Arrays, das hier nur noch geslict wurde).
// Die Suchbox bleibt bewusst mit einem lokalen State entkoppelt (debounced), damit
// Tippen nicht bei jedem Zeichen eine Navigation auslöst.
export function ClientsList({
  clients,
  totalCount,
  page,
  totalPages,
  pageSize,
  search,
  statusFilter,
  sort,
}: ClientsListProps) {
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
  // Client-State, damit die Server-Query die richtige Seitengröße kennt).
  useEffect(() => {
    if (searchParams.get("pageSize")) return
    const stored = readStoredPageSize("clients_page_size")
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

  function handleSortChange(value: string) {
    updateParams({ sort: value === "newest" ? null : value, page: null })
  }

  function handlePageChange(p: number) {
    updateParams({ page: p === 1 ? null : String(p) })
  }

  function handlePageSizeChange(size: PageSize) {
    window.localStorage.setItem("clients_page_size", String(size))
    updateParams({ pageSize: size === 10 ? null : String(size), page: null })
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
          {totalCount} Kunde{totalCount !== 1 ? "n" : ""}
        </span>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Kunden entsprechen den aktuellen Filtern.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clients.map((client) => (
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
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}
    </div>
  )
}
