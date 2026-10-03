import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getDashboardKpis } from "@/lib/kpis"
import { getActiveAdAreas } from "@/lib/meta-campaigns-queries"
import { coveringAreas } from "@/lib/ad-coverage"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { PageSize } from "@/components/ui/pagination-bar"
import { ClientDetail } from "./client-detail"

const CAMPAIGN_STATUS_VALUES = new Set(["active", "paused", "completed", "Archiviert"])
const PAGE_SIZES: readonly PageSize[] = [10, 20, 50]
const DEFAULT_PAGE_SIZE: PageSize = 10

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    campaign_q?: string
    campaign_status?: string
    campaign_page?: string
    campaign_pageSize?: string
    tab?: string
  }>
}) {
  const { id } = await params
  const sp = await searchParams
  const supabase = await createSupabaseServerClient()

  // Suche/Filter/Pagination der Kampagnenliste dieses Kunden laufen serverseitig über
  // URL-Parameter - gleiches Muster wie bei der Kunden-/Kandidatenliste (siehe
  // clients/page.tsx, candidates/page.tsx). Keine eigene View nötig (anders als bei den
  // Kandidaten): title/status sind echte Spalten auf campaigns, keine verknüpften/
  // zusammengesetzten Felder.
  const campaignSearch = (sp.campaign_q ?? "").trim()
  const campaignStatusFilter = sp.campaign_status && CAMPAIGN_STATUS_VALUES.has(sp.campaign_status)
    ? sp.campaign_status
    : "alle"
  const campaignPageSize: PageSize = PAGE_SIZES.includes(Number(sp.campaign_pageSize) as PageSize)
    ? (Number(sp.campaign_pageSize) as PageSize)
    : DEFAULT_PAGE_SIZE
  const campaignPage = Math.max(1, Number(sp.campaign_page) || 1)

  let campaignsQuery = supabase
    .from("campaigns")
    .select("id, title, status, created_at, candidates(count), client_assignments(count)", { count: "exact" })
    .eq("client_id", id)
    // Nur aktive Zuordnungen zählen (entfernte haben removed_at).
    .is("client_assignments.removed_at", null)
  if (campaignSearch) campaignsQuery = campaignsQuery.ilike("title", `%${campaignSearch}%`)
  if (campaignStatusFilter !== "alle") campaignsQuery = campaignsQuery.eq("status", campaignStatusFilter)
  const campaignFrom = (campaignPage - 1) * campaignPageSize
  campaignsQuery = campaignsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(campaignFrom, campaignFrom + campaignPageSize - 1)

  const [{ data: client }, { data: campaigns, count: campaignTotalCount }, { data: contacts }, { data: fileRows }, { data: assignments }, kpis, { data: kanzleiCampaignRows }, adAreas] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    campaignsQuery,
    supabase
      .from("client_contacts")
      .select("id, name, email, phone, role")
      .eq("client_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("client_files")
      .select("*")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
    // Nur AKTIVE Zuordnungen (removed_at is null) - gleiche Definition wie im
    // Kunden-Portal selbst (client_portal_rls_foundation.sql). Beendete Zuordnungen
    // sollen hier nicht als "aktuell zugeordnete Kandidaten" auftauchen.
    supabase
      .from("client_assignments")
      .select("id, status, created_at, campaign_id, campaigns(title), candidates(id, first_name, last_name, berufsbild, campaigns(title))")
      .eq("client_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    getDashboardKpis(supabase, id),
    // Aktive Kanzlei-Kampagnen des Kunden: Grundlage für "Verfügbare Kandidaten" (T-33).
    supabase
      .from("campaigns")
      .select("id, title, berufsbild, radius_km, plz")
      .eq("client_id", id)
      .eq("kind", "kanzlei")
      .eq("status", "active")
      .order("title", { ascending: true }),
    // Werbegebiete laufender Meta-Kampagnen für den Abdeckungs-Hinweis (Atlas T-38).
    getActiveAdAreas(supabase as unknown as SupabaseClient),
  ])

  if (!client) notFound()

  // Projekt-Reiter (Paket 9): Kanzleiprofil, Stellen, Kommentare, Team.
  const [{ data: profileRow }, { data: positionRows }, { data: commentRows }, { data: teamRows }, { data: { user } }] = await Promise.all([
    supabase.from("client_profiles").select("*").eq("client_id", id).maybeSingle(),
    supabase.from("client_positions").select("*").eq("client_id", id).order("sort_order").order("created_at"),
    supabase.from("client_comments").select("id, author_id, kind, content, created_at, edited_at").eq("client_id", id).order("created_at", { ascending: false }).limit(300),
    supabase.from("profiles").select("id, full_name, role").in("role", ["agency_admin", "agency_member"]).order("full_name"),
    supabase.auth.getUser(),
  ])
  const team = (teamRows ?? []).map((t) => ({ id: t.id, full_name: t.full_name }))
  const nameOf = (profileId: string | null) => (profileId ? team.find((t) => t.id === profileId)?.full_name ?? "Unbekannt" : "System")
  const commentFiles = (fileRows ?? []).filter((f) => f.comment_id)
  const project = {
    meta: {
      project_phase: client.project_phase ?? "onboarding",
      contract_start: client.contract_start ?? null,
      contract_term_months: client.contract_term_months ?? null,
      key_account_manager_id: client.key_account_manager_id ?? null,
      close_lead_id: client.close_lead_id ?? null,
      close_url: client.close_url ?? null,
      close_status: client.close_status ?? null,
      close_status_at: client.close_status_at ?? null,
    },
    profile: profileRow ? { ...profileRow, finalized_by_name: profileRow.finalized_by ? nameOf(profileRow.finalized_by) : null } : null,
    positions: (positionRows ?? []).map((p) => ({ ...p, campaign_id: p.campaign_id ?? null })),
    comments: (commentRows ?? []).map((c) => ({
      id: c.id,
      authorId: c.author_id,
      authorName: nameOf(c.author_id),
      kind: c.kind,
      content: c.content,
      createdAt: c.created_at,
      editedAt: c.edited_at,
      files: commentFiles.filter((f) => f.comment_id === c.id).map((f) => ({ id: f.id, name: f.file_name, path: f.file_path })),
    })),
    team,
    currentUserId: user?.id ?? "",
    isAdmin: (teamRows ?? []).find((t) => t.id === user?.id)?.role === "agency_admin",
  }

  // Liegt die Kanzlei im Werbegebiet einer laufenden Meta-Kampagne? Hilft bei neuen
  // Kunden zu entscheiden, ob eine neue Kampagne nötig ist (Atlas T-38).
  const adCoverage = coveringAreas(client.lat, client.lng, adAreas).map((a) => ({
    campaignId: a.campaignId,
    campaignTitle: a.campaignTitle,
    label: a.label,
    radiusKm: a.radiusKm,
    distanceKm: a.distanceKm,
  }))

  // Portal-Zugänge per Admin-Client statt über die RLS-Session: Portal-Profile haben
  // bewusst agency_id = NULL (Sicherheitsvorfall 22.09.2026), die "Profile der eigenen
  // Agentur"-Policy zeigt sie dem Team deshalb nicht - die Liste war dadurch immer leer.
  // Sicher, weil erst hier nach dem RLS-geprüften Laden des Kunden (sonst notFound
  // oben) und streng auf diesen Kunden und role "client" gefiltert wird.
  //
  // Aktiv/eingeladen laesst sich nicht aus profiles ablesen (dort steht nur, DASS ein
  // Portal-Profil existiert) - dafuer muss der zugehoerige Auth-User per Admin-API
  // abgefragt werden (last_sign_in_at gesetzt => hat sich schon mal eingeloggt).
  const admin = createSupabaseAdminClient()
  const { data: portalProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .eq("client_id", client.id)
    .eq("role", "client")
    .order("created_at", { ascending: true })
  const portalUsers = await Promise.all(
    (portalProfiles ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id)
      return {
        id: p.id,
        email: p.email,
        status: data.user?.last_sign_in_at ? ("aktiv" as const) : ("eingeladen" as const),
      }
    })
  )

  const files = await Promise.all(
    (fileRows ?? []).map(async (f) => {
      const { data: urlData } = await supabase.storage
        .from("client-files")
        .createSignedUrl(f.file_path, 3600)
      return {
        id: f.id,
        name: f.file_name,
        storage_path: f.file_path,
        size: f.file_size,
        mime_type: f.mime_type,
        created_at: f.created_at,
        signedUrl: urlData?.signedUrl ?? null,
      }
    })
  )

  const campaignList = (campaigns ?? []).map((c) => {
    const countRow = Array.isArray(c.candidates) ? c.candidates[0] : null
    const leads_count = countRow ? Number((countRow as { count: number | string }).count) : 0
    const assignedRow = Array.isArray(c.client_assignments) ? c.client_assignments[0] : null
    const assigned_count = assignedRow ? Number((assignedRow as { count: number | string }).count) : 0
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      created_at: c.created_at,
      leads_count,
      assigned_count,
    }
  })

  // Supabase liefert eingebettete Many-to-one-Relationen (candidate_id -> candidates,
  // campaign_id -> campaigns) je nach ermittelter Kardinalität als Objekt oder
  // Einzel-Array - hier defensiv beides abfangen, gleiches Muster wie candidates(count)
  // oben bei campaignList.
  function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
    if (Array.isArray(value)) return value[0] ?? null
    return value ?? null
  }

  const assignedCandidates = (assignments ?? [])
    .map((a) => {
      const candidate = firstOrSelf(a.candidates)
      if (!candidate) return null
      const campaign = firstOrSelf(candidate.campaigns)
      const assignmentCampaign = firstOrSelf(a.campaigns)
      return {
        assignmentId: a.id,
        assignmentStatus: a.status,
        assignedSince: a.created_at,
        candidateId: candidate.id,
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        berufsbild: candidate.berufsbild,
        campaignTitle: campaign?.title ?? null,
        assignmentCampaignId: a.campaign_id,
        assignmentCampaignTitle: assignmentCampaign?.title ?? null,
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  const campaignTotalCountSafe = campaignTotalCount ?? 0
  const campaignTotalPages = Math.max(1, Math.ceil(campaignTotalCountSafe / campaignPageSize))

  return (
    <ClientDetail
      portalUsers={portalUsers}
      client={{
        id: client.id,
        kanzleistelle_company_id: client.kanzleistelle_company_id ?? null,
        name: client.name,
        contact_email: client.contact_email,
        phone: client.phone,
        active: client.active,
        status: (client.status as string) ?? "Aktiv",
        logo_url: (client.logo_url as string | null) ?? null,
        leadtable_customer_id: client.leadtable_customer_id ?? null,
        plz: client.plz ?? null,
        lat: client.lat ?? null,
        lng: client.lng ?? null,
        ort: client.ort ?? null,
        auto_forward_enabled: client.auto_forward_enabled ?? false,
      }}
      campaigns={campaignList}
      campaignSearch={campaignSearch}
      campaignStatusFilter={campaignStatusFilter}
      campaignPage={campaignPage}
      campaignTotalPages={campaignTotalPages}
      campaignPageSize={campaignPageSize}
      campaignTotalCount={campaignTotalCountSafe}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        role: c.role ?? null,
      }))}
      files={files}
      assignedCandidates={assignedCandidates}
      kanzleiCampaigns={kanzleiCampaignRows ?? []}
      adCoverage={adCoverage}
      adAreasKnown={adAreas.length > 0}
      kpis={kpis}
      project={project}
      initialTab={sp.tab === "projekt" ? "projekt" : undefined}
    />
  )
}
