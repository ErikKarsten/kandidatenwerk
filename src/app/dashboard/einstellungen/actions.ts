"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

const MIN_PASSWORD_LENGTH = 8

// Aendert den eigenen Namen. Laeuft ueber den Admin-Client, da profiles nur
// SELECT fuer "authenticated" gegrantet hat (siehe 20260901000000_grant_profiles_write.sql
// - INSERT/UPDATE/DELETE nur fuer service_role) - die id kommt aber aus der echten,
// server-seitig verifizierten Session (nicht vom Client uebergeben), es wird also nie
// ein fremdes Profil angefasst.
export async function updateOwnNameAction(fullName: string): Promise<{ error: string } | null> {
  const trimmed = fullName.trim()
  if (!trimmed) return { error: "Name darf nicht leer sein." }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const admin = createSupabaseAdminClient()
  const { error } = await admin.from("profiles").update({ full_name: trimmed }).eq("id", user.id)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/einstellungen")
  return null
}

// Eigenes Passwort aendern - im Unterschied zu setNewPasswordAction
// (set-password/actions.ts) braucht es hier KEINE establishInviteSessionAction davor:
// der Nutzer ist bereits regulaer eingeloggt, der normale Server-Client sieht seine
// Session schon per Cookie. supabase.auth.updateUser() wirkt immer auf den gerade
// authentifizierten Nutzer, verlangt bewusst nicht das alte Passwort zur Bestaetigung
// (macht Supabase Auth serverseitig genauso wenig wie die bestehende
// set-password-Seite) - Doppel-Eingabe (Passwort + Wiederholen) ist der einzige Schutz
// vor Vertippern, wie ueberall sonst im Produkt.
export async function updateOwnPasswordAction(password: string): Promise<{ error: string } | null> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.` }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }

  return null
}

export interface TeamMember {
  id: string
  full_name: string | null
  email: string | null
  role: "agency_admin" | "agency_member"
}

// Teamliste der eigenen Agentur - fuer die Seite selbst (page.tsx), nicht als Action,
// aber hier mit den Schreib-Actions gebuendelt, da alle drei zusammen die
// Team-Verwaltung ausmachen. profiles.email ist bei bestehenden Team-Profilen NULL
// (nur bei neu ueber inviteTeamMemberAction eingeladenen gesetzt) - fehlende Adressen
// werden wie bei den Portal-Nutzern (clients/[id]/page.tsx) einzeln per Admin-API
// nachgeladen.
export async function getTeamMembers(agencyId: string): Promise<TeamMember[]> {
  const supabase = await createSupabaseServerClient()
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("agency_id", agencyId)
    .in("role", ["agency_admin", "agency_member"])
    .order("created_at", { ascending: true })

  const admin = createSupabaseAdminClient()
  const resolved = await Promise.all(
    (profiles ?? []).map(async (p) => {
      if (p.email) return p as TeamMember
      const { data } = await admin.auth.admin.getUserById(p.id)
      return { ...p, email: data.user?.email ?? null } as TeamMember
    })
  )
  return resolved
}

export async function inviteTeamMemberAction(
  email: string,
  role: "agency_admin" | "agency_member"
): Promise<{ error: string } | null> {
  const trimmedEmail = email.trim()
  if (!trimmedEmail) return { error: "E-Mail-Adresse ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: ownProfile } = await supabase.from("profiles").select("agency_id").eq("id", user.id).single()
  if (!ownProfile?.agency_id) return { error: "Eigene Agentur konnte nicht ermittelt werden." }

  const admin = createSupabaseAdminClient()

  // Gleiches Muster wie inviteClientPortalUserAction (clients/[id]/actions.ts): Invite
  // ueber die Auth-Admin-API, danach eigene profiles-Zeile nachziehen. Bei
  // Profil-Insert-Fehler den bereits eingeladenen Auth-User wieder entfernen, damit
  // kein verwaister Login ohne Profil zurueckbleibt.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    redirectTo: "https://kandidatenwerk.kanzleistelle24.de/set-password",
  })
  if (error) return { error: error.message }
  if (!data.user) return { error: "Einladung konnte nicht erstellt werden." }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role,
    agency_id: ownProfile.agency_id,
    email: trimmedEmail,
  })

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: profileError.message }
  }

  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function removeTeamMemberAction(profileId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }
  if (profileId === user.id) return { error: "Du kannst dich nicht selbst entfernen." }

  const admin = createSupabaseAdminClient()
  const { error: profileError } = await admin.from("profiles").delete().eq("id", profileId)
  if (profileError) return { error: profileError.message }

  const { error: authError } = await admin.auth.admin.deleteUser(profileId)
  if (authError) return { error: authError.message }

  revalidatePath("/dashboard/einstellungen")
  return null
}

// agencies hat kein UPDATE-Grant/Policy fuer "authenticated" (nur das GRANT SELECT aus
// 20260715000004_grant_agencies_select.sql) - deshalb auch hier der Admin-Client, mit
// agency_id serverseitig aus dem eigenen Profil ermittelt statt vom Client
// entgegengenommen.
export async function updateAgencyNameAction(name: string): Promise<{ error: string } | null> {
  const trimmed = name.trim()
  if (!trimmed) return { error: "Name darf nicht leer sein." }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: ownProfile } = await supabase.from("profiles").select("agency_id").eq("id", user.id).single()
  if (!ownProfile?.agency_id) return { error: "Eigene Agentur konnte nicht ermittelt werden." }

  const admin = createSupabaseAdminClient()
  const { error } = await admin.from("agencies").update({ name: trimmed }).eq("id", ownProfile.agency_id)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/einstellungen")
  return null
}
