// Lebenslauf im Kundenportal (Paket 87): Jede Kanzlei, die einen Kandidaten im Portal öffnen
// kann, kann auch seinen Lebenslauf herunterladen. Zugriff wie im Portal: aktive Zuordnung
// zur eigenen Kanzlei (über die RLS-Session des Portal-Nutzers geprüft) und vorqualifiziert.
// Die übrigen Angaben (Felddefinitionen, Logo, Ansprechpartner) liest danach der
// Service-Role-Client - Portal-Nutzer haben keine agency_id (siehe portal/candidates/[id]).
// Im Lebenslauf stehen nur die Zusatzfelder, die die Kanzlei auch im Portal sieht.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { resolveTemplateFieldKeys } from "@/lib/field-templates"
import { isPortalVisible } from "@/lib/portal-visibility"

export interface PortalCvContext {
  allowedKeys: Set<string>
  definitions: { key: string; label: string; active: boolean }[]
  logoUrl: string | null
  agencyName: string | null
  contact: string
}

export async function loadPortalCvContext(supabase: SupabaseClient<Database>, candidateId: string): Promise<PortalCvContext | null> {
  const [{ data: assignment }, { data: candidate }] = await Promise.all([
    supabase.from("client_assignments").select("client_id, campaign_id").eq("candidate_id", candidateId).is("removed_at", null).limit(1).maybeSingle(),
    supabase.from("candidates").select("status, is_demo").eq("id", candidateId).maybeSingle(),
  ])
  if (!assignment || !isPortalVisible(candidate)) return null

  const admin = createSupabaseAdminClient()
  const { data: client } = await admin.from("clients").select("agency_id, key_account_manager_id").eq("id", assignment.client_id).maybeSingle()
  const agencyId = client?.agency_id ?? null
  const [{ data: definitionRows }, { data: templateRows }, { data: campaign }, { data: settings }, { data: agency }, { data: kam }] = await Promise.all([
    agencyId
      ? admin.from("custom_field_definitions").select("key, label, active, section").eq("agency_id", agencyId).order("sort_order")
      : Promise.resolve({ data: [] as { key: string; label: string; active: boolean; section: string | null }[] }),
    agencyId ? admin.from("field_templates").select("id, field_keys, is_default").eq("agency_id", agencyId) : Promise.resolve({ data: [] }),
    assignment.campaign_id ? admin.from("campaigns").select("field_template_id").eq("id", assignment.campaign_id).maybeSingle() : Promise.resolve({ data: null }),
    agencyId ? admin.from("agency_settings").select("logo_url").eq("agency_id", agencyId).maybeSingle() : Promise.resolve({ data: null }),
    agencyId ? admin.from("agencies").select("name").eq("id", agencyId).maybeSingle() : Promise.resolve({ data: null }),
    client?.key_account_manager_id
      ? admin.from("profiles").select("full_name, email, phone").eq("id", client.key_account_manager_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Wie im Portal: Stammdaten-Felder plus die Felder der Feld-Vorlage (ohne Vorlage alle).
  const definitions = (definitionRows ?? []).filter((d) => d.active)
  const templateKeys = resolveTemplateFieldKeys(templateRows ?? [], assignment.campaign_id ? [campaign?.field_template_id ?? null] : [])
  const allowedKeys = new Set([
    ...definitions.filter((d) => d.section === "stammdaten").map((d) => d.key),
    ...(templateKeys ?? definitions.filter((d) => d.section !== "stammdaten").map((d) => d.key)),
  ])

  return {
    allowedKeys,
    definitions: definitions.map(({ key, label, active }) => ({ key, label, active })),
    logoUrl: settings?.logo_url ?? null,
    agencyName: agency?.name ?? null,
    contact: [kam?.full_name, kam?.email, kam?.phone].filter(Boolean).join(" · "),
  }
}
