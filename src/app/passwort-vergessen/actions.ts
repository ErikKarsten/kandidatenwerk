"use server"

import { headers } from "next/headers"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { checkLoginRateLimit } from "@/lib/ratelimit"
import { createPasswordResetLink, sendPasswordResetMail } from "@/lib/password-reset"

export type ResetState = { ok: boolean; message: string } | null

const GENERIC = "Falls es zu dieser Adresse einen Zugang gibt, haben wir dir einen Link zum Festlegen eines neuen Passworts geschickt. Bitte schau auch im Spam-Ordner nach."

// "Passwort vergessen?" auf der Login-Seite (Paket 20, T-91). Antwortet immer gleich, damit
// sich nicht herausfinden lässt, welche Adressen einen Zugang haben; begrenzt wie der Login.
export async function requestPasswordResetAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Bitte eine gültige E-Mail-Adresse eingeben." }

  const ip = (await headers()).get("cf-connecting-ip")
  if (!(await checkLoginRateLimit(email, ip))) return { ok: false, message: "Zu viele Anfragen. Bitte warte eine Minute und versuche es dann erneut." }

  try {
    const admin = createSupabaseAdminClient()
    const { data: profile } = await admin.from("profiles").select("id").ilike("email", email).maybeSingle()
    if (profile) {
      const link = await createPasswordResetLink(email)
      await sendPasswordResetMail(email, link)
    }
  } catch (err) {
    console.error("[passwort-vergessen]", err instanceof Error ? err.message : err)
  }
  return { ok: true, message: GENERIC }
}
