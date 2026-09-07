"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

// Diagnose vom 2026-09-07: @supabase/ssr's createBrowserClient() erzwingt intern
// flowType "pkce" (im Paket selbst hart nach dem options-Spread gesetzt, nicht von
// außen überschreibbar - siehe node_modules/@supabase/ssr/dist/.../createBrowserClient.js).
// Supabase-Admin-generierte Einladungs-/Magic-Links liefern aber klassische implizite
// Hash-Tokens (#access_token=...&refresh_token=...), nie einen "code"-Parameter - es
// gibt serverseitig keinen PKCE-Code-Verifier, den ein Admin-Aufruf setzen könnte.
// GoTrueClient._initialize() erkennt den Hash korrekt als "implicit"-Callback, sieht
// aber flowType "pkce" und wirft intern AuthPKCEGrantCodeExchangeError ("Not a valid
// PKCE flow url.") - verifiziert per auth-js-Debug-Log. Die Session wird dadurch nie
// gespeichert; onAuthStateChange feuert trotzdem pflichtgemäß INITIAL_SESSION für den
// neu registrierten Listener, aber mit session=null. Kein Konsolenfehler (der throw
// wird nur über das debug-gate von _initialize geloggt), daher der ursprünglich
// unauffällige Bug.
//
// Fix: Die Tokens aus dem Hash werden hier direkt per setSession() auf dem
// SERVER-Client gesetzt, der keine URL-Erkennung braucht und vom flowType-Problem
// daher gar nicht betroffen ist. setSession() auf dem @supabase/ssr-Server-Client
// schreibt die Session korrekt als Cookie (über den cookies()-Adapter in
// supabase-server.ts) - die Middleware sieht sie dadurch sofort beim nächsten Request.
export async function establishInviteSessionAction(
  accessToken: string,
  refreshToken: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) return { error: error.message }
  return null
}

// Passwort setzen UND die Rolle für die Redirect-Entscheidung ermitteln laufen jetzt
// beide serverseitig über denselben Client, der die per establishInviteSessionAction
// gesetzte Cookie-Session bereits sieht - kein browserseitiger Supabase-Client mehr
// nötig für diese Seite.
export async function setNewPasswordAction(
  password: string
): Promise<{ error: string } | { redirectTo: string }> {
  const supabase = await createSupabaseServerClient()

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) return { error: updateError.message }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null }

  return { redirectTo: profile?.role === "client" ? "/portal" : "/dashboard" }
}
