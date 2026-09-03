import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getDashboardKpis } from "@/lib/kpis"
import { ClientDetail } from "./client-detail"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: client }, { data: campaigns }, { data: contacts }, { data: fileRows }, kpis] = await Promise.all([
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
    getDashboardKpis(supabase, id),
  ])

  if (!client) notFound()

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

  return (
    <ClientDetail
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
      kpis={kpis}
    />
  )
}
