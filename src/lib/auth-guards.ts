import type { createSupabaseServerClient } from "@/lib/supabase-server"

// Rollen-Guards für Server Actions. Server Actions sind öffentlich aufrufbare
// POST-Endpunkte (die Action-IDs stehen in den ausgelieferten JS-Chunks unter
// /_next/static) - die Middleware schützt nur Seitenaufrufe, nicht jede Action. Jede
// Action, die den Admin-Client (service_role, umgeht RLS) oder externe Dienste nutzt,
// muss die Rolle deshalb selbst prüfen (Security-Review 02.10.2026).
//
// Bewusst Positivliste: nur agency_admin/agency_member gelten als Staff. Die früheren
// lokalen requireStaffUser()-Kopien schlossen nur role "client" aus und ließen damit
// auch Nutzer ganz ohne profiles-Zeile durch.

type ServerSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>

export type StaffRole = "agency_admin" | "agency_member"

export interface StaffContext {
  userId: string
  role: StaffRole
  agencyId: string | null
}

const STAFF_ROLES: readonly string[] = ["agency_admin", "agency_member"]

export async function getStaffContext(
  supabase: ServerSupabase
): Promise<{ error: string } | { staff: StaffContext }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id")
    .eq("id", user.id)
    .single()
  if (!profile || !STAFF_ROLES.includes(profile.role)) return { error: "Nicht berechtigt." }

  return { staff: { userId: user.id, role: profile.role as StaffRole, agencyId: profile.agency_id } }
}

// Kurzform für Actions, die nur "ist Staff?" brauchen.
export async function requireStaffUser(supabase: ServerSupabase): Promise<{ error: string } | null> {
  const result = await getStaffContext(supabase)
  return "error" in result ? { error: result.error } : null
}

export async function requireAgencyAdmin(
  supabase: ServerSupabase
): Promise<{ error: string } | { staff: StaffContext }> {
  const result = await getStaffContext(supabase)
  if ("error" in result) return result
  if (result.staff.role !== "agency_admin") return { error: "Nur für Agentur-Admins." }
  return result
}
