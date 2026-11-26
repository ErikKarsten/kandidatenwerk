import Link from "@/components/app-link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { ASSIGNMENT_STATUS_OPTIONS } from "@/lib/assignment-status"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { PROJECT_PHASES } from "@/lib/client-project"
import { type PipelineSegment } from "@/components/dashboard/client-card"
import type { PageSize } from "@/components/ui/pagination-bar"
import { ClientsList, type ClientListItem, type ClientsSortOption, type ClientsStatusFilter } from "./clients-list"

const ARCHIVED_STATUS = "Archiviert"

type ServerDb = Awaited<ReturnType<typeof createSupabaseServerClient>>

// Je Kunde: Kandidaten gesamt (Leads der eigenen Kampagnen + zugeordnete, ohne doppelte) und
// der Status der noch nicht zugeordneten Leads, über alle Kampagnen des Kunden.
async function kampagnenLeads(supabase: ServerDb, clientIds: string[]) {
  const ergebnis = new Map<string, { kandidaten: number; leadPipeline: { status: string; count: number }[] }>()
  if (!clientIds.length) return ergebnis
  const [{ data: kampagnen }, { data: zuordnungen }] = await Promise.all([
    supabase.from("campaigns").select("id, client_id").in("client_id", clientIds).eq("is_demo", false),
    supabase.from("client_assignments").select("client_id, candidate_id").in("client_id", clientIds).is("removed_at", null),
  ])
  const kundeJeKampagne = new Map((kampagnen ?? []).map((k) => [k.id, k.client_id as string]))
  const leads: { status: string; campaign_id: string | null; id: string }[] = []
  const kampagnenIds = [...kundeJeKampagne.keys()]
  for (let von = 0; kampagnenIds.length; von += 1000) {
    const { data: seite } = await supabase.from("candidates").select("id, status, campaign_id").in("campaign_id", kampagnenIds).eq("is_demo", false).order("id").range(von, von + 999)
    leads.push(...(seite ?? []))
    if (!seite || seite.length < 1000) break
  }
  for (const id of clientIds) {
    const zugeordnet = new Set((zuordnungen ?? []).filter((z) => z.client_id === id).map((z) => z.candidate_id))
    const eigene = leads.filter((l) => l.campaign_id && kundeJeKampagne.get(l.campaign_id) === id)
    const offen = eigene.filter((l) => !zugeordnet.has(l.id))
    const jeStatus = new Map<string, number>()
    for (const l of offen) jeStatus.set(l.status, (jeStatus.get(l.status) ?? 0) + 1)
    ergebnis.set(id, {
      kandidaten: zugeordnet.size + offen.length,
      leadPipeline: CANDIDATE_STATUS_OPTIONS.filter((o) => jeStatus.has(o.value)).map((o) => ({ status: o.value, count: jeStatus.get(o.value)! })),
    })
  }
  return ergebnis
}
// Pipeline nach Status beim Kunden (Paket 31).
const VALID_STATUSES: Set<string> = new Set(ASSIGNMENT_STATUS_OPTIONS.map((o) => o.value))
const PAGE_SIZES: readonly PageSize[] = [10, 20, 50]
const DEFAULT_PAGE_SIZE: PageSize = 10

const SORT_COLUMNS: Record<ClientsSortOption, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  "name-asc": { column: "name", ascending: true },
  "name-desc": { column: "name", ascending: false },
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{
    show_archived?: string
    q?: string
    status?: string
    sort?: string
    page?: string
    pageSize?: string
    phase?: string
    kam?: string
  }>
}) {
  const sp = await searchParams
  const showArchived = sp.show_archived === "1"
  const search = (sp.q ?? "").trim()
  const statusFilter: ClientsStatusFilter =
    sp.status === "aktiv" || sp.status === "inaktiv" ? sp.status : "alle"
  const sort: ClientsSortOption = sp.sort && sp.sort in SORT_COLUMNS ? (sp.sort as ClientsSortOption) : "newest"
  const pageSize: PageSize = PAGE_SIZES.includes(Number(sp.pageSize) as PageSize)
    ? (Number(sp.pageSize) as PageSize)
    : DEFAULT_PAGE_SIZE
  const page = Math.max(1, Number(sp.page) || 1)
  const phaseFilter = PROJECT_PHASES.some((p) => p.value === sp.phase) ? sp.phase! : "alle"

  const supabase = await createSupabaseServerClient()
  const [{ data: { user } }, { data: teamRows }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("id, full_name").in("role", ["agency_admin", "agency_member"]).order("full_name"),
  ])
  const team = (teamRows ?? []).map((t) => ({ id: t.id, full_name: t.full_name }))
  // "me" = eigene Kunden; sonst eine Profil-ID aus dem Team.
  const kamFilter = sp.kam === "me" || team.some((t) => t.id === sp.kam) ? sp.kam! : "alle"
  const kamId = kamFilter === "me" ? user?.id ?? null : kamFilter === "alle" ? null : kamFilter

  let query = supabase
    .from("client_list_stats")
    .select(
      "id, name, contact_name, contact_email, active, status, logo_url, created_at, campaign_count, candidate_count, placement_count, pipeline, project_phase, key_account_manager_id, profile_finalized",
      { count: "exact" }
    )

  query = showArchived ? query.eq("status", ARCHIVED_STATUS) : query.neq("status", ARCHIVED_STATUS)
  if (statusFilter === "aktiv") query = query.eq("active", true)
  if (statusFilter === "inaktiv") query = query.eq("active", false)
  if (search) query = query.ilike("name", `%${search}%`)
  if (phaseFilter !== "alle") query = query.eq("project_phase", phaseFilter)
  if (kamId) query = query.eq("key_account_manager_id", kamId)

  const { column, ascending } = SORT_COLUMNS[sort]
  query = query.order(column, { ascending })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count } = await query

  // Leads aus den Kampagnen der Kanzlei (Paket 116): Die View zählt nur Kandidaten, die der
  // Kanzlei zugeordnet sind - Leads der eigenen Kampagnen (erst nach Vorqualifizierung
  // zugeordnet) fehlten, PMPG stand mit 31 Leads bei 0.
  const leadStats = await kampagnenLeads(supabase, (data ?? []).map((c) => c.id ?? "").filter(Boolean))

  // Gleiche VALID_STATUSES-Filterung wie vorher (Archiviert/unbekannte Legacy-Status
  // fliegen aus der Pipeline-Anzeige raus) - nur jetzt auf dem Ergebnis der View statt
  // auf in-memory aggregierten Daten.
  const clientList: ClientListItem[] = (data ?? []).map((client) => {
    const pipeline: PipelineSegment[] = (client.pipeline as { status: string; count: number }[])
      .filter((seg) => VALID_STATUSES.has(seg.status))
      .map((seg) => ({ status: seg.status as PipelineSegment["status"], count: seg.count }))

    return {
      // Generierte View-Spalten sind laut database.ts pauschal nullable (PostgREST
      // gibt fuer Views keine NOT-NULL-Constraints ans OpenAPI-Schema weiter) - diese
      // Felder sind ueber clients.<spalte> NOT NULL bzw. DEFAULT abgesichert, daher
      // hier bewusste Fallbacks statt einer echten Null-Behandlung in der UI.
      id: client.id ?? "",
      name: client.name ?? "",
      contact_name: client.contact_name,
      contact_email: client.contact_email,
      active: client.active ?? false,
      status: client.status ?? "",
      logo_url: client.logo_url,
      created_at: client.created_at ?? "",
      tags: [],
      stats: {
        kandidaten: leadStats.get(client.id ?? "")?.kandidaten ?? client.candidate_count ?? 0,
        kampagnen: client.campaign_count ?? 0,
        eingestellt: client.placement_count ?? 0,
      },
      pipeline,
      leadPipeline: leadStats.get(client.id ?? "")?.leadPipeline ?? [],
      project: (() => {
        const phase = PROJECT_PHASES.find((p) => p.value === client.project_phase) ?? PROJECT_PHASES[0]
        return {
          phase: phase.value,
          phaseLabel: phase.label,
          phaseColor: phase.color,
          kamName: team.find((t) => t.id === client.key_account_manager_id)?.full_name ?? null,
          profileFinalized: client.profile_finalized ?? false,
        }
      })(),
    }
  })

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  // "Noch keine Kunden angelegt" nur im echten Leerfall (keine Filter aktiv) zeigen -
  // eine Such-/Filterkombination ohne Treffer bekommt stattdessen die
  // "Keine Kunden entsprechen den aktuellen Filtern"-Meldung in ClientsList.
  const trulyEmpty = totalCount === 0 && !search && statusFilter === "alle" && phaseFilter === "alle" && kamFilter === "alle" && !showArchived

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kunden</h1>
          <p className="mt-1 text-sm text-gray-500">{totalCount} Einträge</p>
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

      {trulyEmpty ? (
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
        <ClientsList
          clients={clientList}
          totalCount={totalCount}
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          search={search}
          statusFilter={statusFilter}
          sort={sort}
          phaseFilter={phaseFilter}
          kamFilter={kamFilter}
          team={team}
        />
      )}
    </div>
  )
}
