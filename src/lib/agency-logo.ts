import { createSupabaseAdminClient } from "@/lib/supabase-admin"

// Logo aus Einstellungen > Mein Konto (agency_settings.logo_url) für die Seitenleisten von
// Backend und Kundenportal (Paket 36). Admin-Client, weil Portal-Nutzer agency_settings per
// RLS nicht lesen dürfen; es wird nur die öffentliche Bild-URL weitergegeben.
export async function getAgencyLogoUrl(): Promise<string | null> {
  try {
    const { data } = await createSupabaseAdminClient().from("agency_settings").select("logo_url").not("logo_url", "is", null).limit(1).maybeSingle()
    return (data?.logo_url as string | null) ?? null
  } catch {
    return null
  }
}
