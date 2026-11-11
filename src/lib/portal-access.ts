// Portal-Zugänge für Kanzleien (Paket 23, T-95): Jeder Ansprechpartner mit E-Mail ist auch
// ein Portal-Zugang. Angelegt wird still (ohne Mail, auch über Close); die Einladung geht
// erst per Knopf raus. Zugänge entstehen über die Admin-API ohne Passwort - festgelegt wird
// es über den Link auf /set-password.
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { sendPortalAccessMail } from "@/lib/password-reset"
import { createPasswordLink } from "@/lib/password-link"

export type EnsureResult = { profileId: string; created: boolean } | { error: string }

async function clientExists(admin: ReturnType<typeof createSupabaseAdminClient>, clientId: string | null): Promise<boolean> {
  if (!clientId) return false
  const { data, error } = await admin.from("clients").select("id").eq("id", clientId).maybeSingle()
  // Im Zweifel (Abfragefehler) als vorhanden werten, damit kein fremder Zugang übernommen wird.
  return !!data || !!error
}

export async function ensurePortalAccess(clientId: string, rawEmail: string): Promise<EnsureResult> {
  const email = rawEmail.trim().toLowerCase()
  if (!email) return { error: "Keine E-Mail-Adresse." }
  const admin = createSupabaseAdminClient()
  const { data: existing } = await admin.from("profiles").select("id, role, client_id").ilike("email", email).maybeSingle()
  if (existing) {
    if (existing.role === "client" && existing.client_id === clientId) return { profileId: existing.id, created: false }
    // Paket 100: Zugang eines gelöschten Kunden (z. B. Kunde gelöscht und neu angelegt) wird
    // übernommen statt blockiert. Login und Passwort bleiben erhalten. Vorher hieß es
    // "schon Portal-Zugang eines anderen Kunden", obwohl es den Kunden nicht mehr gab.
    if (existing.role === "client" && !(await clientExists(admin, existing.client_id))) {
      const { error: moveError } = await admin.from("profiles").update({ client_id: clientId }).eq("id", existing.id)
      if (moveError) return { error: moveError.message }
      return { profileId: existing.id, created: false }
    }
    return { error: existing.role === "client" ? "Diese E-Mail ist schon Portal-Zugang eines anderen Kunden." : "Diese E-Mail gehört zu einem Team-Zugang." }
  }

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data.user) return { error: error?.message ?? "Zugang konnte nicht angelegt werden." }
  // agency_id bewusst NULL (Portal-Kunden, siehe Sicherheitsvorfall 22.09.2026).
  const { error: profileError } = await admin.from("profiles").insert({ id: data.user.id, role: "client", client_id: clientId, agency_id: null, email })
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: profileError.message }
  }
  return { profileId: data.user.id, created: true }
}

// Einladung (noch nie angemeldet) bzw. Passwort-Link (schon aktiv) verschicken.
export async function sendPortalInvite(profileId: string, email: string): Promise<"einladung" | "passwort"> {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.auth.admin.getUserById(profileId)
  const kind = data.user?.last_sign_in_at ? "passwort" : "einladung"
  // Eigener Link (Paket 55): ohne Ablaufzeit, Mail-Prüfprogramme verbrauchen ihn nicht.
  await sendPortalAccessMail(email, await createPasswordLink(profileId, null), kind)
  if (kind === "einladung") await admin.from("profiles").update({ portal_invited_at: new Date().toISOString() }).eq("id", profileId)
  return kind
}
