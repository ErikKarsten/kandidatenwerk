import Link from "next/link"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { ASSIGNMENT_STATUS_OPTIONS } from "@/lib/assignment-status"
import { SOURCE_OPTIONS } from "@/lib/candidate-source"
import type { PageSize } from "@/components/ui/pagination-bar"
import { CandidatesList, type CandidateListItem, type CandidatesSortOption } from "./candidates-list"
import { SampleCandidatesButton } from "./sample-candidates-button"
import { canCreateSamples } from "@/lib/teams"

const ARCHIVED_STATUS = "Archiviert"
// Interner Status oder - mit Präfix "kunde:" - Status beim Kunden (Paket 31).
const VALID_STATUSES: Set<string> = new Set([
  ...CANDIDATE_STATUS_OPTIONS.map((o) => o.value),
  ...ASSIGNMENT_STATUS_OPTIONS.map((o) => `kunde:${o.value}`),
])
// Berufsbilder sind pflegbar (Paket 45) - nur das Format des Schlüssels prüfen.
const BERUFSBILD_KEY = /^[a-z0-9_]+$/
const VALID_SOURCES: Set<string> = new Set(SOURCE_OPTIONS.map((o) => o.value))
const PAGE_SIZES: readonly PageSize[] = [10, 20, 50]
const DEFAULT_PAGE_SIZE: PageSize = 10

const SORT_COLUMNS: Record<CandidatesSortOption, { column: string; ascending: boolean }> = {
  newest: { column: "created_at", ascending: false },
  oldest: { column: "created_at", ascending: true },
  "name-asc": { column: "full_name", ascending: true },
  "name-desc": { column: "full_name", ascending: false },
}

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{
    show_archived?: string
    q?: string
    status?: string
    berufsbild?: string
    source?: string
    tag?: string
    campaign?: string
    sort?: string
    page?: string
    pageSize?: string
  }>
}) {
  const sp = await searchParams
  const showArchived = sp.show_archived === "1"
  const search = (sp.q ?? "").trim()
  const statusFilter = sp.status && VALID_STATUSES.has(sp.status) ? sp.status : "alle"
  const berufsbildFilter = sp.berufsbild && BERUFSBILD_KEY.test(sp.berufsbild) ? sp.berufsbild : "alle"
  const sourceFilter = sp.source && VALID_SOURCES.has(sp.source) ? sp.source : "alle"
  const tagFilter = (sp.tag ?? "").trim() || "alle"
  // Aus "Kandidaten nach Kampagnen" (Paket 46): nur Kandidaten einer Lead-Kampagne.
  const campaignFilter = /^[0-9a-f-]{36}$/.test(sp.campaign ?? "") ? sp.campaign! : null
  const sort: CandidatesSortOption =
    sp.sort && sp.sort in SORT_COLUMNS ? (sp.sort as CandidatesSortOption) : "newest"
  const pageSize: PageSize = PAGE_SIZES.includes(Number(sp.pageSize) as PageSize)
    ? (Number(sp.pageSize) as PageSize)
    : DEFAULT_PAGE_SIZE
  const page = Math.max(1, Number(sp.page) || 1)

  const supabase = await createSupabaseServerClient()
  // Musterdatensätze nur für Admins und den Vertrieb (Paket 44).
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user ? await supabase.from("profiles").select("role, team").eq("id", user.id).maybeSingle() : { data: null }

  let query = supabase
    .from("candidate_list_rows")
    .select(
      "id, first_name, last_name, email, status, berufsbild, source, created_at, custom_fields, campaign_id, campaign_title, client_id, client_name, tags, assignment_status, assignments",
      { count: "exact" }
    )

  query = showArchived ? query.eq("status", ARCHIVED_STATUS) : query.neq("status", ARCHIVED_STATUS)
  if (statusFilter.startsWith("kunde:")) query = query.eq("assignment_status", statusFilter.slice("kunde:".length))
  else if (statusFilter !== "alle") query = query.eq("status", statusFilter)
  if (berufsbildFilter !== "alle") query = query.eq("berufsbild", berufsbildFilter)
  if (sourceFilter !== "alle") query = query.eq("source", sourceFilter)
  if (tagFilter !== "alle") query = query.contains("tags", [tagFilter])
  if (campaignFilter) query = query.eq("campaign_id", campaignFilter)
  if (search) {
    // Gleiches Suchverhalten wie vorher: Treffer bei Name (Vor- UND Nachname
    // zusammen, siehe full_name in der View) ODER E-Mail. Komma/Klammern entfernt,
    // da .or() sie als Trennzeichen der Filterliste interpretiert (PostgREST-Syntax,
    // nicht LIKE-Semantik) - Namen/E-Mails enthalten diese Zeichen praktisch nie,
    // ein Verlust dieser Zeichen in der Suche ist unkritisch. %/_ als LIKE-Wildcards
    // escaped, damit ein wörtlich eingegebenes "%" nicht als Platzhalter wirkt.
    const safe = search.replace(/[,()]/g, "").replace(/[%_]/g, (m) => `\\${m}`)
    query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%`)
  }

  const { column, ascending } = SORT_COLUMNS[sort]
  // id als deterministischer Tiebreaker: bei Namensgleichstand (kommt vor, z.B.
  // mehrere Kandidaten mit kaputtem Platzhalter-Namen wie "--") ist die Sortierung
  // sonst nicht eindeutig - ohne festen Tiebreaker koennte echtes .range()-basiertes
  // Pagination bei solchen Ties Zeilen zwischen Seiten doppelt zeigen oder auslassen.
  // Das war beim alten clientseitigen Sortieren eines komplett geladenen Arrays kein
  // Thema (JS-Sort ist stabil, die ganze Liste lag eh im Speicher), ist bei echtem
  // serverseitigem Pagination aber ein echtes Korrektheitsproblem.
  query = query.order(column, { ascending }).order("id", { ascending: true })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const [{ data, count }, { data: tagRows }, { data: filterCampaign }] = await Promise.all([
    query,
    supabase.from("candidate_tag_list").select("tag").order("tag"),
    campaignFilter ? supabase.from("campaigns").select("title").eq("id", campaignFilter).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const knownTags = (tagRows ?? []).map((r) => r.tag).filter((t): t is string => !!t)

  // Generierte View-Spalten sind laut database.ts pauschal nullable (PostgREST gibt
  // fuer Views keine NOT-NULL-Constraints ans OpenAPI-Schema weiter) - diese Felder
  // sind ueber candidates.<spalte> NOT NULL bzw. DEFAULT abgesichert, daher hier
  // bewusste Fallbacks statt einer echten Null-Behandlung in der UI.
  const candidateList: CandidateListItem[] = (data ?? []).map((c) => ({
    id: c.id ?? "",
    first_name: c.first_name ?? "",
    last_name: c.last_name ?? "",
    email: c.email,
    status: c.status ?? "",
    berufsbild: c.berufsbild,
    source: c.source ?? "",
    created_at: c.created_at ?? "",
    custom_fields: (c.custom_fields as Record<string, string> | null) ?? null,
    tags: c.tags ?? [],
    assignments: Array.isArray(c.assignments) ? (c.assignments as { client_id: string; client_name: string; status: string }[]) : [],
    campaigns: c.campaign_id
      ? {
          id: c.campaign_id,
          title: c.campaign_title ?? "",
          clients: c.client_id ? { id: c.client_id, name: c.client_name ?? "" } : null,
        }
      : null,
  }))

  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  const trulyEmpty =
    totalCount === 0 &&
    !search &&
    statusFilter === "alle" &&
    berufsbildFilter === "alle" &&
    sourceFilter === "alle" &&
    tagFilter === "alle" &&
    !campaignFilter &&
    !showArchived

  return (
    <div className="flex flex-col gap-8 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Kandidaten</h1>
          <p className="mt-1 text-sm text-gray-500">{totalCount} Einträge</p>

        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showArchived ? "/dashboard/candidates" : "/dashboard/candidates?show_archived=1"}
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
          {canCreateSamples(me) && <SampleCandidatesButton />}
          <Button asChild style={{ backgroundColor: "#1e56a0" }}>
            <Link href="/dashboard/candidates/new">
              <Plus size={16} />
              Neuer Kandidat
            </Link>
          </Button>
        </div>
      </div>

      {/* Aus "Kandidaten nach Kampagnen" (Paket 46/48): eigene Zeile, langer Name gekürzt. */}
      {campaignFilter && (
        <div className="-mt-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-xs font-medium" style={{ backgroundColor: "#1e56a012", color: "#1e56a0" }}>
          <span className="min-w-0 max-w-full truncate" title={filterCampaign?.title ?? undefined}>
            Kampagne: {filterCampaign?.title?.replace(/^\s*ks[\s-]?24\s*[-–|:]\s*/i, "") ?? "unbekannt"}
          </span>
          <Link href="/dashboard/leads" className="shrink-0 underline">zurück zu den Kampagnen</Link>
          <Link href="/dashboard/candidates" className="shrink-0 underline">Filter entfernen</Link>
        </div>
      )}

      <CandidatesList
        candidates={candidateList}
        showArchived={showArchived}
        trulyEmpty={trulyEmpty}
        totalCount={totalCount}
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        search={search}
        statusFilter={statusFilter}
        berufsbildFilter={berufsbildFilter}
        tagFilter={tagFilter}
        knownTags={knownTags}
        sort={sort}
      />
    </div>
  )
}
