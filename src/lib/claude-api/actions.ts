"use server"

// Claude-Zugang in Einstellungen → Mein Konto (Paket 111): eigene API-Schlüssel anlegen,
// ansehen, widerrufen. Ganzes Team (Paket 112; vorher nur Agentur-Admins). api_schluessel hat keine RLS-Policy - Zugriff
// per Service-Rolle, immer auf die eigene Person beschränkt.
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext } from "@/lib/auth-guards"
import { neuerSchluessel } from "@/lib/claude-api/schluessel"
import { APP_BASE_URL } from "@/lib/app-url"

export interface ApiSchluesselZeile {
  id: string
  name: string
  praefix: string
  created_at: string
  last_used_at: string | null
}

const db = () => createSupabaseAdminClient() as unknown as SupabaseClient

export async function listApiKeysAction(): Promise<{ error: string } | { schluessel: ApiSchluesselZeile[] }> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  const { data, error } = await db()
    .from("api_schluessel")
    .select("id, name, praefix, created_at, last_used_at")
    .eq("profile_id", guard.staff.userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
  if (error) return { error: error.message }
  return { schluessel: (data ?? []) as ApiSchluesselZeile[] }
}

export async function createApiKeyAction(name: string): Promise<{ error: string } | { schluessel: string; befehl: string }> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  const bezeichnung = (name ?? "").trim().slice(0, 80)
  if (!bezeichnung) return { error: "Bitte einen Namen angeben, z. B. „MacBook Claude Code“." }
  const { count } = await db().from("api_schluessel").select("id", { count: "exact", head: true }).eq("profile_id", guard.staff.userId).is("revoked_at", null)
  if ((count ?? 0) >= 5) return { error: "Höchstens 5 aktive Schlüssel. Bitte erst einen alten widerrufen." }
  const neu = await neuerSchluessel()
  const { error } = await db().from("api_schluessel").insert({ profile_id: guard.staff.userId, name: bezeichnung, praefix: neu.praefix, hash: neu.hash })
  if (error) return { error: error.message }
  return {
    schluessel: neu.schluessel,
    befehl: `claude mcp add --transport http --scope user kandidatenwerk ${APP_BASE_URL}/api/mcp --header "Authorization: Bearer ${neu.schluessel}"`,
  }
}

export async function revokeApiKeyAction(id: string): Promise<{ error: string } | null> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  const { error } = await db().from("api_schluessel").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("profile_id", guard.staff.userId)
  return error ? { error: error.message } : null
}
