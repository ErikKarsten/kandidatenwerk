"use client"

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

export interface CampaignListItem {
  id: string
  title: string
  description: string | null
  status: string
  meta_campaign_id: string | null
  created_at: string
  clients: { name: string } | { name: string }[] | null
}

export function CampaignsList({ campaigns, showArchived }: { campaigns: CampaignListItem[]; showArchived: boolean }) {
  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    campaigns,
    "campaigns_page_size"
  )

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
              const clientName = Array.isArray(campaign.clients)
                ? campaign.clients[0]?.name ?? "—"
                : (campaign.clients as { name: string } | null)?.name ?? "—"
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
  )
}
