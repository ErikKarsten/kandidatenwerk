import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { ClientDetail } from "./client-detail"

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const [{ data: client }, { data: campaigns }, { data: contacts }] = await Promise.all([
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
  ])

  if (!client) notFound()

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
      }}
      campaigns={campaignList}
      contacts={(contacts ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        role: c.role ?? null,
      }))}
    />
  )
}
