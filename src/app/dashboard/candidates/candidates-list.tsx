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
  neu: "Neu",
  interview: "Interview",
  vorgestellt: "Vorgestellt",
  platziert: "Platziert",
  abgelehnt: "Abgelehnt",
}

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  neu: { bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  interview: { bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  vorgestellt: { bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  platziert: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  abgelehnt: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

const FALLBACK_COLOR = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }

export interface CandidateListItem {
  id: string
  first_name: string
  last_name: string
  email: string | null
  status: string
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
  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    candidates,
    "candidates_page_size"
  )

  if (candidates.length === 0) {
    return (
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Name</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Kampagne</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
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
    <div className="flex flex-col gap-0">
      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ borderColor: "#dde3ea" }}>
              <TableHead className="text-gray-600">Name</TableHead>
              <TableHead className="text-gray-600">E-Mail</TableHead>
              <TableHead className="text-gray-600">Kampagne</TableHead>
              <TableHead className="text-gray-600">Kunde</TableHead>
              <TableHead className="text-gray-600">Status</TableHead>
              <TableHead className="text-gray-600">Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((c) => {
              const colors = STATUS_COLORS[c.status] ?? FALLBACK_COLOR
              const campaign = Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns as { id: string; title: string; clients: { id: string; name: string } | null } | null
              const client = campaign ? (Array.isArray(campaign.clients) ? campaign.clients[0] : campaign.clients) : null
              return (
                <TableRow key={c.id} style={{ borderColor: "#dde3ea" }}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/candidates/${c.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                      {c.first_name} {c.last_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-gray-600">
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.email}</a>
                    ) : "—"}
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
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: colors.bg, color: colors.text }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                      {STATUS_LABEL[c.status] ?? c.status}
                    </span>
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
  )
}
