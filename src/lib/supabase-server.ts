import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/types/database"

// Bis 09.09.2026 stand hier faelschlich SUPABASE_SECRET_KEY (service_role-Aequivalent)
// statt des dafuer vorgesehenen Publishable-Keys. Beim Security-Review empirisch
// gegengetestet: @supabase/ssr nutzt bei vorhandener Session ohnehin das Access-Token
// aus den Cookies fuer den Authorization-Header, nicht den hier uebergebenen Key -
// RLS griff also schon vorher korrekt. Trotzdem kein Grund, von diesem Verhalten
// abhaengig zu bleiben - mit dem Publishable-Key ist die Sicherheit nicht mehr
// implizit an "es gibt immer eine gueltige Session" gekoppelt, sondern folgt dem von
// Supabase fuer @supabase/ssr vorgesehenen Muster.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll may be called from a Server Component where setting cookies
            // is not allowed — the proxy handles session refresh in that case.
          }
        },
      },
    }
  )
}
