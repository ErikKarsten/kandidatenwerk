import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

// profiles hat selbst keine E-Mail-Spalte - die Adresse liegt nur in auth.users. Für
// jeden Admin (role = 'agency_admin') daher ein admin.getUserById()-Aufruf über die
// Supabase Auth Admin-API. Setzt voraus, dass `supabase` mit dem Secret-/Service-Role-
// Key erstellt wurde (siehe supabase-server.ts bzw. scripts/*) - mit dem publishable
// Key schlägt admin.getUserById fehl. Admins ohne auffindbare E-Mail (z.B. gelöschter
// Auth-User bei noch vorhandenem Profil) werden übersprungen statt den ganzen Aufruf
// abzubrechen.
export async function getAdminEmails(supabase: Supabase): Promise<string[]> {
  const { data: admins, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "agency_admin")

  if (error) throw new Error(`Admin-Profile konnten nicht geladen werden: ${error.message}`)
  if (!admins || admins.length === 0) return []

  const emails: string[] = []
  for (const admin of admins) {
    const { data, error: userError } = await supabase.auth.admin.getUserById(admin.id)
    if (userError || !data?.user?.email) continue
    emails.push(data.user.email)
  }

  return emails
}
