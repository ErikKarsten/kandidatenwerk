import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { ClientsList } from "./clients-list"

const ARCHIVED_STATUS = "Archiviert"

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_archived?: string }>
}) {
  const { show_archived } = await searchParams
  const showArchived = show_archived === "1"

  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from("clients")
    .select("id, name, contact_name, contact_email, active, status, logo_url, campaigns(count)")
    .order("created_at", { ascending: false })

  query = showArchived
    ? query.eq("status", ARCHIVED_STATUS)
    : query.neq("status", ARCHIVED_STATUS)

  const { data: clients } = await query

  const clientList = (clients ?? []).map((c) => {
    const countRow = Array.isArray(c.campaigns) ? c.campaigns[0] : null
    const campaign_count = countRow ? Number((countRow as { count: number | string }).count) : 0
    return { ...c, campaign_count }
  })

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="mt-1 text-sm text-gray-500">{clientList.length} Einträge</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/dashboard/clients" : "/dashboard/clients?show_archived=1"}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
            style={{
              borderColor: showArchived ? "#1e56a0" : "#dde3ea",
              color: showArchived ? "#1e56a0" : "#6b7280",
              backgroundColor: showArchived ? "#1e56a018" : undefined,
            }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: showArchived ? "#1e56a0" : "#d1d5db" }} />
            Archivierte anzeigen
          </Link>
          <Button asChild style={{ backgroundColor: "#1e56a0" }}>
            <Link href="/dashboard/clients/new">
              <Plus size={16} />
              Neuer Kunde
            </Link>
          </Button>
        </div>
      </div>

      {clientList.length === 0 ? (
        <div
          className="rounded-xl border bg-white py-16 text-center text-sm text-gray-400"
          style={{ borderColor: "#dde3ea" }}
        >
          {showArchived ? (
            "Keine archivierten Kunden vorhanden."
          ) : (
            <>
              Noch keine Kunden angelegt.{" "}
              <Link href="/dashboard/clients/new" style={{ color: "#1e56a0" }} className="hover:underline">
                Ersten Kunden anlegen
              </Link>
            </>
          )}
        </div>
      ) : (
        <ClientsList clients={clientList} />
      )}
    </div>
  )
}
