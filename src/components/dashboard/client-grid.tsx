"use client"

import Link from "next/link"
import { ClientCard, type ClientCardProps } from "./client-card"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

export function ClientGrid({ clients }: { clients: ClientCardProps[] }) {
  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    clients,
    "dashboard_clients_page_size"
  )

  return (
    <div className="flex flex-col gap-4">
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
    </div>
  )
}
