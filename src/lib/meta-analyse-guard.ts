import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext } from "@/lib/auth-guards"

// Schnittstelle des Meta-Analyse-Tools (Paket 108): nur fürs Team. Die meta_*-Tabellen
// haben keine RLS-Policy - Zugriff per Service-Rolle nach dieser Prüfung.
export async function metaAnalyseZugang(): Promise<{ db: SupabaseClient } | { antwort: NextResponse }> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return { antwort: NextResponse.json({ fehler: "Bitte in Kandidatenwerk anmelden." }, { status: 401 }) }
  return { db: createSupabaseAdminClient() as unknown as SupabaseClient }
}

export function fehlerAntwort(err: unknown): NextResponse {
  const text = err instanceof Error ? err.message : String(err)
  return NextResponse.json({ fehler: text.replace(/EAA[A-Za-z0-9]{15,}/g, "[REDACTED]").slice(0, 300) }, { status: 502 })
}
