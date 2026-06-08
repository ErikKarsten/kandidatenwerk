import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/types/database"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
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
