// Eigene Links zum Passwort-Setzen (Paket 55): ohne Ablaufzeit, verbraucht erst beim
// Speichern des neuen Passworts (Link-Vorschauen in Teams/WhatsApp/Mail schaden nicht),
// ein neuer Link ersetzt den alten. In der Datenbank liegt nur der SHA-256-Hash.
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const BASE_URL = "https://kandidatenwerk.kanzleistelle24.de/passwort-setzen"

function toBase64Url(bytes: Uint8Array): string {
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function createPasswordLink(userId: string, createdBy: string | null): Promise<string> {
  const admin = createSupabaseAdminClient()
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  // Ältere, noch nicht genutzte Links dieser Person werden ungültig.
  await admin.from("password_links").delete().eq("user_id", userId).is("used_at", null)
  const { error } = await admin.from("password_links").insert({ user_id: userId, token_hash: await hashToken(token), created_by: createdBy })
  if (error) throw new Error(error.message)
  return `${BASE_URL}/${token}`
}

// Gültiger (noch nicht genutzter) Link -> Person, sonst null.
export async function findPasswordLink(token: string): Promise<{ id: string; userId: string } | null> {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from("password_links").select("id, user_id, used_at").eq("token_hash", await hashToken(token)).maybeSingle()
  return data && !data.used_at ? { id: data.id, userId: data.user_id } : null
}

// Setzt das Passwort und verbraucht den Link; liefert die E-Mail für die Anmeldung.
export async function redeemPasswordLink(token: string, password: string): Promise<{ email: string } | { error: string }> {
  const link = await findPasswordLink(token)
  if (!link) return { error: "Dieser Link ist ungültig oder wurde schon verwendet. Bitte einen neuen Link anfordern." }
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.updateUserById(link.userId, { password, email_confirm: true })
  if (error || !data.user?.email) return { error: error?.message ?? "Passwort konnte nicht gesetzt werden." }
  await admin.from("password_links").update({ used_at: new Date().toISOString() }).eq("id", link.id)
  return { email: data.user.email }
}
