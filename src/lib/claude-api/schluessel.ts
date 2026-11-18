// API-Schlüssel für die Claude-Schnittstelle (Paket 111). Format "kw_" + 43 Zeichen
// (32 Zufallsbytes, base64url). Gespeichert wird nur der SHA-256-Hash.
import type { SupabaseClient } from "@supabase/supabase-js"

export const SCHLUESSEL_PREFIX = "kw_"

function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function neuerSchluessel(): Promise<{ schluessel: string; praefix: string; hash: string }> {
  const schluessel = SCHLUESSEL_PREFIX + base64Url(crypto.getRandomValues(new Uint8Array(32)))
  return { schluessel, praefix: schluessel.slice(0, 10), hash: await sha256Hex(schluessel) }
}

export interface ApiZugang {
  schluesselId: string
  profileId: string
  name: string
}

// Prüft "Authorization: Bearer kw_…". Nur gültige, nicht widerrufene Schlüssel von Personen,
// die (noch) Agentur-Admin sind.
export async function pruefeSchluessel(db: SupabaseClient, authorization: string | null): Promise<ApiZugang | null> {
  const token = authorization?.match(/^Bearer\s+(kw_[A-Za-z0-9_-]{20,100})\s*$/)?.[1]
  if (!token) return null
  const { data: key } = await db
    .from("api_schluessel")
    .select("id, profile_id, revoked_at, last_used_at")
    .eq("hash", await sha256Hex(token))
    .maybeSingle()
  if (!key || key.revoked_at) return null
  const { data: profile } = await db.from("profiles").select("role, full_name, email").eq("id", key.profile_id).maybeSingle()
  if (!profile || profile.role !== "agency_admin") return null
  // "Zuletzt benutzt" höchstens alle 5 Minuten schreiben.
  if (!key.last_used_at || Date.now() - Date.parse(key.last_used_at as string) > 5 * 60_000) {
    await db.from("api_schluessel").update({ last_used_at: new Date().toISOString() }).eq("id", key.id)
  }
  return { schluesselId: key.id as string, profileId: key.profile_id as string, name: ((profile.full_name || profile.email) as string) ?? "" }
}
