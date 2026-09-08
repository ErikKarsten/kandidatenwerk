import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getDashboardKpis } from "@/lib/kpis"
import { ClientDetail } from "./client-detail"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: client }, { data: campaigns }, { data: contacts }, { data: fileRows }, { data: portalProfiles }, { data: assignments }, kpis] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("campaigns")
      .select("id, title, status, created_at, candidates(count)")
      .eq("client_id", id)
      .order("created_at", { ascending: false }),
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
    supabase
      .from("profiles")
      .select("id, email")
      .eq("client_id", id)
      .eq("role", "client")
      .order("created_at", { ascending: true }),
    // Nur AKTIVE Zuordnungen (removed_at is null) - gleiche Definition wie im
    // Kunden-Portal selbst (client_portal_rls_foundation.sql). Beendete Zuordnungen
    // sollen hier nicht als "aktuell zugeordnete Kandidaten" auftauchen.
    supabase
      .from("client_assignments")
      .select("id, status, created_at, candidates(id, first_name, last_name, berufsbild, campaigns(title))")
      .eq("client_id", id)
      .is("removed_at", null)
      .order("created_at", { ascending: false }),
    getDashboardKpis(supabase, id),
  ])

  if (!client) notFound()

  // Aktiv/eingeladen laesst sich nicht aus profiles ablesen (dort steht nur, DASS ein
  // Portal-Profil existiert) - dafuer muss der zugehoerige Auth-User per Admin-API
  // abgefragt werden (last_sign_in_at gesetzt => hat sich schon mal eingeloggt).
  const admin = createSupabaseAdminClient()
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
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      created_at: c.created_at,
      leads_count,
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
      return {
        assignmentId: a.id,
        assignmentStatus: a.status,
        assignedSince: a.created_at,
        candidateId: candidate.id,
        firstName: candidate.first_name,
        lastName: candidate.last_name,
        berufsbild: candidate.berufsbild,
        campaignTitle: campaign?.title ?? null,
      }
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)

  return (
    <ClientDetail
      portalUsers={portalUsers}
      client={{
        id: client.id,
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
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        role: c.role ?? null,
      }))}
      files={files}
      assignedCandidates={assignedCandidates}
      kpis={kpis}
    />
  )
}
