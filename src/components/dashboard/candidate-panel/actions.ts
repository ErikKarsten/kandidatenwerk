"use server"

// Daten für das Kandidaten-Seitenfenster (Paket 13, T-55/T-56): kompakt alles, was man
// in Karte/Listen braucht, ohne die Seite zu wechseln. Nur Team.
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { resolveTemplateFieldKeys } from "@/lib/field-templates"

export interface CandidatePanelData {
  id: string
  firstName: string
  lastName: string
  status: string
  berufsbild: string | null
  email: string | null
  phone: string | null
  plz: string | null
  notes: string | null
  offeneFragen: string | null
  createdAt: string
  origin: string | null
  stammdaten: { key: string; label: string; value: string }[]
  zusatzfelder: { key: string; label: string; value: string }[]
  tags: string[]
  knownTags: string[]
  assignments: { id: string; clientId: string; clientName: string; campaignId: string | null; campaignTitle: string | null; status: string }[]
}

export async function getCandidatePanelDataAction(candidateId: string): Promise<{ error: string } | { data: CandidatePanelData }> {
  const supabase = await createSupabaseServerClient()
  const ctx = await getStaffContext(supabase)
  if ("error" in ctx) return ctx

  const [{ data: c }, { data: assignments }, { data: definitions }, { data: templates }, { data: tagRows }] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, first_name, last_name, status, berufsbild, email, phone, plz, notes, offene_fragen, created_at, custom_fields, tags, campaigns(title)")
      .eq("id", candidateId)
      .maybeSingle(),
    supabase
      .from("client_assignments")
      .select("id, status, client_id, campaign_id, clients(name), campaigns(title, field_template_id)")
      .eq("candidate_id", candidateId)
      .is("removed_at", null),
    supabase.from("custom_field_definitions").select("key, label, section, sort_order").eq("active", true).order("sort_order"),
    supabase.from("field_templates").select("id, field_keys, is_default"),
    supabase.from("candidate_tag_list").select("tag").order("tag"),
  ])
  if (!c) return { error: "Kandidat nicht gefunden." }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const values = (c.custom_fields as Record<string, string> | null) ?? {}
  const defs = definitions ?? []
  const templateKeys = resolveTemplateFieldKeys(
    templates ?? [],
    (assignments ?? []).filter((a) => a.campaign_id).map((a) => one(a.campaigns as { field_template_id: string | null } | null)?.field_template_id ?? null)
  )
  const zusatz = defs.filter((d) => d.section !== "stammdaten")
  const shown = templateKeys ? templateKeys.map((k) => zusatz.find((d) => d.key === k)).filter((d): d is (typeof zusatz)[number] => !!d) : zusatz
  const withValue = (list: typeof defs) =>
    list.filter((d) => (values[d.key] ?? "").trim()).map((d) => ({ key: d.key, label: d.label, value: values[d.key].trim() }))

  return {
    data: {
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      status: c.status,
      berufsbild: c.berufsbild,
      email: c.email,
      phone: c.phone,
      plz: c.plz,
      notes: c.notes,
      offeneFragen: c.offene_fragen,
      createdAt: c.created_at,
      origin: one(c.campaigns as { title: string } | null)?.title ?? null,
      stammdaten: withValue(defs.filter((d) => d.section === "stammdaten")),
      zusatzfelder: withValue(shown),
      tags: c.tags ?? [],
      knownTags: (tagRows ?? []).map((r) => r.tag).filter((t): t is string => !!t),
      assignments: (assignments ?? []).map((a) => ({
        id: a.id,
        clientId: a.client_id,
        clientName: one(a.clients as { name: string } | null)?.name ?? "Unbekannt",
        campaignId: a.campaign_id,
        campaignTitle: one(a.campaigns as { title: string } | null)?.title ?? null,
        status: a.status,
      })),
    },
  }
}
