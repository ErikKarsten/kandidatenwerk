"use client"

import Link from "next/link"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

function getInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase()
}

const ARCHIVED_STATUS = "Archiviert"

export interface ClientListItem {
  id: string
  name: string
  contact_name: string | null
  contact_email: string | null
  active: boolean
  status: string
  logo_url: string | null
  campaign_count: number
}

export function ClientsList({ clients }: { clients: ClientListItem[] }) {
  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    clients,
    "clients_page_size"
  )

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
