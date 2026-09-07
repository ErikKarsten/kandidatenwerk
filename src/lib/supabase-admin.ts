import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

// ACHTUNG: Dieser Client läuft mit dem Secret-Key (service_role) OHNE Bindung an eine
// eingeloggte Nutzer-Session - er umgeht ALLE RLS-Policies vollständig. Nur für echte
// Admin-Operationen verwenden, bei denen das Umgehen von RLS bewusst gewollt ist
// (z.B. Portal-Nutzer einladen, deren profiles-Zeile anlegen). Für alles andere -
// jedes Laden/Ändern von Daten im Auftrag des aktuell eingeloggten Nutzers -
// stattdessen createSupabaseServerClient() aus supabase-server.ts verwenden, damit
// die RLS-Policies greifen.
export function createSupabaseAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
