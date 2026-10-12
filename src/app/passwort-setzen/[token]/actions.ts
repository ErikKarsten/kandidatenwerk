"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"
import { redeemPasswordLink } from "@/lib/password-link"

const MIN_PASSWORD_LENGTH = 8

// Passwort über einen eigenen Link setzen (Paket 55) und die Person direkt anmelden.
export async function setPasswordFromLinkAction(token: string, password: string): Promise<{ error: string } | { redirectTo: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.` }
  const result = await redeemPasswordLink(token, password)
  if ("error" in result) return result

  const supabase = await createSupabaseServerClient()
  // Eine bestehende Sitzung (z. B. eines Admins im selben Browser) wird ersetzt.
  await supabase.auth.signOut()
  const { data, error } = await supabase.auth.signInWithPassword({ email: result.email, password })
  if (error || !data.user) return { redirectTo: "/login" }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).single()
  return { redirectTo: profile?.role === "client" ? "/portal" : "/dashboard" }
}
