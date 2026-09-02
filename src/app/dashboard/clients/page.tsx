import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { type PipelineSegment } from "@/components/dashboard/client-card"
import { ClientsList } from "./clients-list"

const ARCHIVED_STATUS = "Archiviert"
const VALID_STATUSES: Set<string> = new Set(CANDIDATE_STATUS_OPTIONS.map((o) => o.value))

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ show_archived?: string }>
}) {
  const { show_archived } = await searchParams
  const showArchived = show_archived === "1"

  const supabase = await createSupabaseServerClient()

  let clientsQuery = supabase
    .from("clients")
    .select("id, name, contact_name, contact_email, active, status, logo_url, created_at")
    .order("created_at", { ascending: false })

  clientsQuery = showArchived
    ? clientsQuery.eq("status", ARCHIVED_STATUS)
    : clientsQuery.neq("status", ARCHIVED_STATUS)

  // Kampagnen/Kandidaten werden bewusst komplett geladen statt pro Kunde gefiltert
  // abgefragt (gleiches Muster wie vormals in dashboard/page.tsx) - die drei
  // Kennzahlen (Kandidaten/Kampagnen/Platzierungen) pro Kunde werden anschließend
  // in-memory über campaign_id -> client_id aggregiert, da candidates keine direkte
  // client_id-Verknüpfung über die Kampagne hinaus hat.
  const [{ data: clients }, { data: campaigns }, { data: candidates }] = await Promise.all([
    clientsQuery,
    supabase.from("campaigns").select("id, client_id"),
    supabase.from("candidates").select("campaign_id, status"),
  ])

  // campaign_id -> client_id lookup
  const campaignToClient = new Map<string, string>()
  for (const c of campaigns ?? []) {
    campaignToClient.set(c.id, c.client_id)
  }

  // client_id -> campaign ids
  const clientCampaigns = new Map<string, Set<string>>()
  // client_id -> { status -> count }
  const clientStatusCounts = new Map<string, Record<string, number>>()

  for (const c of clients ?? []) {
    clientCampaigns.set(c.id, new Set())
    clientStatusCounts.set(c.id, {})
  }

  for (const camp of campaigns ?? []) {
    clientCampaigns.get(camp.client_id)?.add(camp.id)
  }

  for (const cand of candidates ?? []) {
    const clientId = cand.campaign_id ? campaignToClient.get(cand.campaign_id) : undefined
    if (!clientId) continue
    const statuses = clientStatusCounts.get(clientId)
    if (!statuses) continue
    statuses[cand.status] = (statuses[cand.status] ?? 0) + 1
  }

  const clientList = (clients ?? []).map((client) => {
    const statuses = clientStatusCounts.get(client.id) ?? {}
    const totalCandidates = Object.values(statuses).reduce((s, v) => s + v, 0)
    const pipeline: PipelineSegment[] = Object.entries(statuses)
      .filter(([s]) => VALID_STATUSES.has(s))
      .map(([status, count]) => ({ status: status as PipelineSegment["status"], count }))

    return {
      id: client.id,
      name: client.name,
      contact_name: client.contact_name,
      contact_email: client.contact_email,
      active: client.active,
      status: client.status,
      logo_url: client.logo_url,
      created_at: client.created_at,
      tags: [] as string[],
      stats: {
        kandidaten: totalCandidates,
        kampagnen: clientCampaigns.get(client.id)?.size ?? 0,
        platzierungen: statuses["platziert"] ?? 0,
      },
      pipeline,
    }
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
