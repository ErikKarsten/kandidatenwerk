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

// "Archiviert" wird bereits über den separaten "Archivierte anzeigen"-Toggle
// (URL-Param) gesteuert und deshalb hier nicht als Filteroption dupliziert.
const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "completed", label: "Abgeschlossen" },
]

export interface CampaignListItem {
  id: string
  title: string
  description: string | null
  status: string
  meta_campaign_id: string | null
  berufsbild: string | null
  created_at: string
  clients: { name: string } | { name: string }[] | null
}

function clientNameOf(clients: CampaignListItem["clients"]): string {
  return Array.isArray(clients) ? clients[0]?.name ?? "—" : clients?.name ?? "—"
}

export function CampaignsList({ campaigns, showArchived }: { campaigns: CampaignListItem[]; showArchived: boolean }) {
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("alle")
  const [berufsbildFilter, setBerufsbildFilter] = useState("alle")

  const filteredCampaigns = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return campaigns.filter((c) => {
      if (statusFilter !== "alle" && c.status !== statusFilter) return false
      if (berufsbildFilter !== "alle" && c.berufsbild !== berufsbildFilter) return false
      if (query) {
        const title = c.title.toLowerCase()
        const clientName = clientNameOf(c.clients).toLowerCase()
        if (!title.includes(query) && !clientName.includes(query)) return false
      }
      return true
    })
  }, [campaigns, searchQuery, statusFilter, berufsbildFilter])

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    filteredCampaigns,
    "campaigns_page_size"
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

  const ARCHIVED_STATUS = "Archiviert"

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Titel</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Meta-Kampagnen-ID</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} className="py-12 text-center text-gray-400">
                {showArchived ? (
                  "Keine archivierten Kampagnen vorhanden."
                ) : (
                  <>
                    Noch keine Kampagnen angelegt.{" "}
                    <Link href="/dashboard/campaigns/new" style={{ color: "#1e56a0" }} className="hover:underline">
                      Erste Kampagne anlegen
                    </Link>
                  </>
                )}
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
            placeholder="Titel oder Kunde suchen…"
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
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
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
                  <TableHead className="text-gray-600">Status</TableHead>
                  <TableHead className="text-gray-600">Meta-Kampagnen-ID</TableHead>
                  <TableHead className="text-gray-600">Erstellt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((campaign) => {
                  const colors = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.completed
                  const isArchived = campaign.status === ARCHIVED_STATUS
                  const clientName = clientNameOf(campaign.clients)
                  return (
                    <TableRow
                      key={campaign.id}
                      style={{ borderColor: "#dde3ea", opacity: isArchived ? 0.65 : 1 }}
                    >
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/campaigns/${campaign.id}`}
                          className="hover:underline"
                          style={{ color: "#1e56a0" }}
                        >
                          {campaign.title}
                        </Link>
                      </TableCell>
                      <TableCell className="text-gray-600">{clientName}</TableCell>
                      <TableCell>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: colors.bg, color: colors.text }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                          {STATUS_LABEL[campaign.status] ?? campaign.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-500 font-mono text-sm">
                        {campaign.meta_campaign_id ?? "—"}
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {new Date(campaign.created_at).toLocaleDateString("de-DE", {
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
