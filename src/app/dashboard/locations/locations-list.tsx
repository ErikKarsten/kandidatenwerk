"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { MapPinned, Search } from "lucide-react"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

export interface LocationListItem {
  id: string
  plz_prefix: string
  name: string | null
  campaign_count: number
}

// Reihenfolge kommt bereits absteigend nach Kampagnen-Anzahl von der Page (Server) rein -
// die Suche filtert nur, ohne die Sortierung zu verändern.
export function LocationsList({ locations }: { locations: LocationListItem[] }) {
  const [searchQuery, setSearchQuery] = useState("")

  const filteredLocations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return locations
    return locations.filter(
      (l) => l.plz_prefix.includes(query) || (l.name ?? "").toLowerCase().includes(query)
    )
  }, [locations, searchQuery])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filteredLocations,
    "locations_page_size"
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
            placeholder="PLZ-Bereich oder Name suchen…"
            className="rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none"
            style={{ borderColor: "#dde3ea", minWidth: "220px" }}
          />
        </div>
        <span className="text-sm text-gray-500">
          {filteredLocations.length} von {locations.length} Standort{locations.length !== 1 ? "e" : ""}
        </span>
      </div>

      {filteredLocations.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Standorte entsprechen der Suche.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((location) => (
              <Link
                key={location.id}
                href={`/dashboard/locations/${location.id}`}
                className="flex flex-col gap-4 rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
                style={{ borderColor: "#dde3ea" }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: "#1e56a0" }}
                  >
                    <MapPinned size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {location.name ?? `${location.plz_prefix}xx`}
                    </p>
                    {location.name && (
                      <p className="truncate text-xs text-gray-500 font-mono">{location.plz_prefix}xx</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">PLZ-Bereich</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}
                  >
                    {location.campaign_count} Kampagne{location.campaign_count !== 1 ? "n" : ""}
                  </span>
                </div>
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
