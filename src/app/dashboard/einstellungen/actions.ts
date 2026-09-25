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

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
}

// Agenturweite E-Mail-Vorlagen - fuer die Seite selbst (page.tsx) und den
// Automatisierungs-Editor (campaigns/[id]/page.tsx), analog zu getTeamMembers oben.
// Kein Admin-Client noetig - RLS auf email_templates scoped automatisch korrekt auf die
// eigene Agentur (siehe 20260922000004_email_templates.sql), gleiches Prinzip wie bei
// den bestehenden Automatisierungs-Actions (automations-actions.ts).
export async function getEmailTemplates(agencyId: string): Promise<EmailTemplate[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("email_templates")
    .select("id, name, subject, body_html")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true })
  return data ?? []
}

export async function createEmailTemplateAction(
  agencyId: string,
  data: { name: string; subject: string; body_html: string }
): Promise<{ error: string } | null> {
  if (!data.name.trim()) return { error: "Name ist ein Pflichtfeld." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("email_templates").insert({ agency_id: agencyId, ...data })
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function updateEmailTemplateAction(
  id: string,
  data: { name: string; subject: string; body_html: string }
): Promise<{ error: string } | null> {
  if (!data.name.trim()) return { error: "Name ist ein Pflichtfeld." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("email_templates").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function deleteEmailTemplateAction(id: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.from("email_templates").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/einstellungen")
  return null
}

// Wer bei einem neuen Lead per Mail benachrichtigt wird (Einstellungen ->
// Automatisierung) - agenturweite Liste von Team-Mitgliedern, siehe notifyLeadRecipients
// in lead-notifications.ts.
export async function getLeadNotificationRecipientIds(agencyId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("lead_notification_recipients")
    .select("profile_id")
    .eq("agency_id", agencyId)
  return (data ?? []).map((r) => r.profile_id)
}

// Ersetzt die komplette Empfänger-Liste (loeschen + neu einfuegen) statt einzeln zu
// diffen - bei einer kleinen, seltenen aenderbaren Liste wie dieser reicht das, gleiches
// simples Muster wie an anderen Stellen im Projekt fuer kleine Einstellungs-Listen.
export async function updateLeadNotificationRecipientsAction(
  agencyId: string,
  profileIds: string[]
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { error: deleteError } = await supabase
    .from("lead_notification_recipients")
    .delete()
    .eq("agency_id", agencyId)
  if (deleteError) return { error: deleteError.message }

  if (profileIds.length > 0) {
    const { error: insertError } = await supabase
      .from("lead_notification_recipients")
      .insert(profileIds.map((profileId) => ({ agency_id: agencyId, profile_id: profileId })))
    if (insertError) return { error: insertError.message }
  }

  revalidatePath("/dashboard/einstellungen")
  return null
}

// ── custom_field_definitions (agenturweit gepflegte Zusatzfelder-Liste) ───────────
// Schritt 2/3 des Umbaus vom 25.09.2026 (ersetzt FIXED_CUSTOM_FIELDS aus
// candidate-custom-fields.ts als Quelle für UI-Anzeige) - Extraktionslogik
// (Leadtable/Meta) folgt in Schritt 3, liest bis dahin weiterhin die alte
// fest-codierte Liste.

export interface CustomFieldDefinition {
  id: string
  key: string
  label: string
  sort_order: number
  active: boolean
}

async function requireAgencyAdmin(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<{ error: string } | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (profile?.role !== "agency_admin") return { error: "Nur Agentur-Admins können Zusatzfelder verwalten." }

  return null
}

// Kein .eq("agency_id", ...) nötig - die RLS-Policy "Team liest Zusatzfeld-
// Definitionen der eigenen Agentur" schränkt ohnehin schon auf die eigene Agentur ein.
export async function getCustomFieldDefinitions(): Promise<CustomFieldDefinition[]> {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase
    .from("custom_field_definitions")
    .select("id, key, label, sort_order, active")
    .order("sort_order", { ascending: true })
  return data ?? []
}

// Leitet aus der eingegebenen Bezeichnung einen stabilen, technischen Schlüssel ab
// (klein geschrieben, Umlaute transliteriert, Sonderzeichen zu "_") - der Admin gibt
// nur die Bezeichnung ein, ohne sich um einen internen Key kümmern zu müssen, genau
// wie die bestehenden 12 Felder es beim Seed schon hatten.
function slugifyFieldKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export async function createCustomFieldDefinitionAction(
  agencyId: string,
  label: string
): Promise<{ error: string } | null> {
  const trimmedLabel = label.trim()
  if (!trimmedLabel) return { error: "Bezeichnung ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  const adminError = await requireAgencyAdmin(supabase)
  if (adminError) return adminError

  const key = slugifyFieldKey(trimmedLabel)
  if (!key) return { error: "Aus dieser Bezeichnung lässt sich kein gültiger interner Schlüssel ableiten." }

  const { data: lastRow } = await supabase
    .from("custom_field_definitions")
    .select("sort_order")
    .eq("agency_id", agencyId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = (lastRow?.sort_order ?? -1) + 1

  const { error } = await supabase.from("custom_field_definitions").insert({
    agency_id: agencyId,
    key,
    label: trimmedLabel,
    sort_order: nextSortOrder,
  })
  if (error) {
    if (error.code === "23505") {
      return { error: `Ein Feld mit diesem Namen (interner Schlüssel "${key}") existiert bereits.` }
    }
    return { error: error.message }
  }

  revalidatePath("/dashboard/einstellungen")
  return null
}

export async function updateCustomFieldDefinitionLabelAction(
  id: string,
  label: string
): Promise<{ error: string } | null> {
  const trimmedLabel = label.trim()
  if (!trimmedLabel) return { error: "Bezeichnung ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  const adminError = await requireAgencyAdmin(supabase)
  if (adminError) return adminError

  const { error } = await supabase
    .from("custom_field_definitions")
    .update({ label: trimmedLabel, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/einstellungen")
  return null
}

// "Löschen" ist rein logisch (active=false) - siehe Migration
// 20260925000000_dynamic_custom_field_definitions.sql: bereits gespeicherte
// Kandidaten-Werte unter dem Key bleiben unangetastet und erscheinen bei
// Reaktivierung wieder normal.
export async function setCustomFieldDefinitionActiveAction(
  id: string,
  active: boolean
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const adminError = await requireAgencyAdmin(supabase)
  if (adminError) return adminError

  const { error } = await supabase
    .from("custom_field_definitions")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/einstellungen")
  revalidatePath("/dashboard/candidates")
  return null
}
