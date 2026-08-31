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

// Gleiches Muster wie campaigns-list.tsx (Status-Label/-Farben, Berufsbild-Label) -
// bewusst dupliziert statt geteilt, da beide Listen unabhängig weiterentwickelt werden
// könnten (z.B. andere Spalten) und der Umfang hier klein genug ist.
const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  Archiviert: "Archiviert",
}

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  active: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  completed: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
  Archiviert: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
}

function berufsbildLabel(value: string | null): string {
  if (!value) return "—"
  return BERUFSBILD_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export interface LocationCampaignItem {
  id: string
  title: string
  status: string
  berufsbild: string | null
  created_at: string
  clients: { name: string } | { name: string }[] | null
}

function clientNameOf(clients: LocationCampaignItem["clients"]): string {
  return Array.isArray(clients) ? clients[0]?.name ?? "—" : clients?.name ?? "—"
}

export function LocationCampaignsList({ campaigns }: { campaigns: LocationCampaignItem[] }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [berufsbildFilter, setBerufsbildFilter] = useState("alle")

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (berufsbildFilter !== "alle" && c.berufsbild !== berufsbildFilter) return false
      if (query) {
        const title = c.title.toLowerCase()
        const clientName = clientNameOf(c.clients).toLowerCase()
        if (!title.includes(query) && !clientName.includes(query)) return false
      }
      return true
    })
  }, [campaigns, searchQuery, berufsbildFilter])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filteredCampaigns,
    "location_campaigns_page_size"
  )

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setPage(1)
  }

  function handleBerufsbildFilterChange(value: string) {
    setBerufsbildFilter(value)
    setPage(1)
  }

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
        Keine Kampagnen an diesem Standort.
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
            placeholder="Titel oder Kunde suchen…"
            className="rounded-md border py-1.5 pl-8 pr-3 text-sm focus:outline-none"
            style={{ borderColor: "#dde3ea", minWidth: "220px" }}
          />
        </div>
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
        <span className="text-sm text-gray-500">
          {filteredCampaigns.length} von {campaigns.length} Kampagne{campaigns.length !== 1 ? "n" : ""}
        </span>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Keine Kampagnen entsprechen den aktuellen Filtern.
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
            <Table>
              <TableHeader>
                <TableRow style={{ borderColor: "#dde3ea" }}>
                  <TableHead className="text-gray-600">Titel</TableHead>
                  <TableHead className="text-gray-600">Kunde</TableHead>
                  <TableHead className="text-gray-600">Berufsbild</TableHead>
                  <TableHead className="text-gray-600">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((campaign) => {
                  const colors = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.completed
                  return (
                    <TableRow key={campaign.id} style={{ borderColor: "#dde3ea" }}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/campaigns/${campaign.id}`}
                          className="hover:underline"
                          style={{ color: "#1e56a0" }}
                        >
                          {campaign.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-gray-600">{clientNameOf(campaign.clients)}</TableCell>
                      <TableCell className="text-gray-600">{berufsbildLabel(campaign.berufsbild)}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                          {STATUS_LABEL[campaign.status] ?? campaign.status}
                        </span>
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
