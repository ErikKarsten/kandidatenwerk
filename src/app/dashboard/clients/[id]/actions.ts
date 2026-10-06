"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { publishClientProfileToKanzleistelle } from "@/lib/kanzleistelle-profile-sync"
import { scheduleKanzleistelleSync } from "@/lib/kanzleistelle-auto-sync"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { createPasswordResetLink } from "@/lib/password-reset"
import { ensurePortalAccess, sendPortalInvite } from "@/lib/portal-access"

// Server Actions verlassen sich nach dem Security-Review vom 09.09.2026 nicht mehr
// ausschliesslich auf RLS als einzige Schutzschicht - requireStaffUser() (src/lib/auth-guards.ts)
// laeuft VOR jedem
// DB-Zugriff und blockt Portal-Kunden (role "client") explizit. client_contacts und
// client_files sind reine Staff-Funktionen (Kontaktverwaltung/Dateiablage der
// Agentur) - im Kunden-Portal gibt es dafuer keine UI, ein Kunde soll hier also
// grundsaetzlich nie ankommen, unabhaengig davon, ob die RLS-Policy gerade korrekt
// gescoped ist.

export async function updateClientAction(
  clientId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const name = formData.get("name") as string
  const contact_email = formData.get("contact_email") as string
  const phone = formData.get("phone") as string
  const active = formData.get("active") === "true"

  if (!name) return { error: "Firmenname ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      contact_email: contact_email || null,
      phone: phone || null,
      active,
    })
    .eq("id", clientId)

  if (error) return { error: error.message }

  // PLZ/Ort kommen seit Paket 16 aus dem Hauptstandort (client_locations, location-actions.ts).
  scheduleKanzleistelleSync(clientId)

  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/clients")
  revalidatePath("/dashboard/campaigns")
  return null
}

export async function uploadClientLogoAction(
  clientId: string,
  formData: FormData
): Promise<{ error: string } | { url: string }> {
  const file = formData.get("logo") as File | null
  if (!file || file.size === 0) return { error: "Keine Datei ausgewählt." }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
  const path = `${clientId}/logo.${ext}`

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("client-logos")
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage.from("client-logos").getPublicUrl(path)
  const logo_url = `${urlData.publicUrl}?v=${Date.now()}`

  const { error: dbError } = await supabase
    .from("clients")
    .update({ logo_url })
    .eq("id", clientId)

  if (dbError) return { error: dbError.message }

  scheduleKanzleistelleSync(clientId)
  revalidatePath(`/dashboard/clients/${clientId}`)
  return { url: logo_url }
}

export async function archiveClientAction(clientId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { error } = await supabase
    .from("clients")
    .update({ status: "Archiviert" })
    .eq("id", clientId)
  if (error) return { error: error.message }
  revalidatePath("/dashboard/clients")
  return null
}

export async function unarchiveClientAction(clientId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { error } = await supabase
    .from("clients")
    .update({ status: "Aktiv" })
    .eq("id", clientId)
  if (error) return { error: error.message }
  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/clients")
  return null
}

export async function deleteClientPermanentlyAction(clientId: string): Promise<{ error: string } | null> {
  console.log("[deleteClientPermanentlyAction] called with clientId:", clientId)
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  // Cascade: candidates → campaigns → client_contacts → client
  const { data: campaigns, error: fetchErr } = await supabase
    .from("campaigns")
    .select("id")
    .eq("client_id", clientId)
  if (fetchErr) {
    console.error("[deleteClientPermanentlyAction] fetchErr:", fetchErr.message)
    return { error: fetchErr.message }
  }

  const campaignIds = (campaigns ?? []).map((c) => c.id)
  console.log("[deleteClientPermanentlyAction] campaignIds:", campaignIds)

  if (campaignIds.length > 0) {
    const { error: candidateErr } = await supabase
      .from("candidates")
      .delete()
      .in("campaign_id", campaignIds)
    if (candidateErr) {
      console.error("[deleteClientPermanentlyAction] candidateErr:", candidateErr.message)
      return { error: candidateErr.message }
    }

    const { error: campaignErr } = await supabase
      .from("campaigns")
      .delete()
      .in("id", campaignIds)
    if (campaignErr) {
      console.error("[deleteClientPermanentlyAction] campaignErr:", campaignErr.message)
      return { error: campaignErr.message }
    }
  }

  await supabase.from("client_contacts").delete().eq("client_id", clientId)

  const { error } = await supabase.from("clients").delete().eq("id", clientId)
  if (error) {
    console.error("[deleteClientPermanentlyAction] deleteErr:", error.message)
    return { error: error.message }
  }

  console.log("[deleteClientPermanentlyAction] success, revalidating")
  revalidatePath("/dashboard/clients")
  return null
}

// "Auf Kanzleistelle24 veröffentlichen" bzw. "Jetzt aktualisieren" (Paket 16, T-52): Firma
// und alle gesuchten Stellen aus dem abgeschlossenen Kanzleiprofil. Danach überträgt
// scheduleKanzleistelleSync Änderungen automatisch.
export async function publishClientToKanzleistelleAction(
  clientId: string
): Promise<{ success: true; firstPublish: boolean; created: number; updated: number } | { success: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  // Nur Staff - schreibt in die Kanzleistelle24-Datenbank (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return { success: false, error: staffError.error }

  try {
    const result = await publishClientProfileToKanzleistelle(clientId)
    revalidatePath(`/dashboard/clients/${clientId}`)
    return { success: true, ...result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await supabase.from("clients").update({ kanzleistelle_sync_error: message }).eq("id", clientId)
    return { success: false, error: message }
  }
}

// ── client_contacts ──────────────────────────────────────────────────────────

interface ContactData {
  name: string
  email: string
  phone: string
  role: string
}

export async function createContactAction(
  clientId: string,
  data: ContactData
): Promise<{ error: string } | null> {
  if (!data.name.trim() || !data.email.trim())
    return { error: "Name und E-Mail sind Pflichtfelder." }

  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { error } = await supabase.from("client_contacts").insert({
    client_id: clientId,
    name: data.name.trim(),
    email: data.email.trim(),
    phone: data.phone.trim() || null,
    role: data.role.trim() || null,
  })

  if (error) return { error: error.message }
  // Ansprechpartner = Portal-Zugang (Paket 23, T-95), still angelegt - Einladung per Knopf.
  await ensurePortalAccess(clientId, data.email)
  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

export async function updateContactAction(
  contactId: string,
  clientId: string,
  data: ContactData
): Promise<{ error: string } | null> {
  if (!data.name.trim() || !data.email.trim())
    return { error: "Name und E-Mail sind Pflichtfelder." }

  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { error } = await supabase
    .from("client_contacts")
    .update({
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim() || null,
      role: data.role.trim() || null,
    })
    .eq("id", contactId)

  if (error) return { error: error.message }
  // Neue E-Mail-Adresse -> ebenfalls Portal-Zugang (Paket 23, T-95), still.
  await ensurePortalAccess(clientId, data.email)
  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

export async function deleteContactAction(
  contactId: string,
  clientId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { error } = await supabase.from("client_contacts").delete().eq("id", contactId)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

// Exaktes Muster wie uploadFileAction/deleteFileAction für Kandidaten (siehe
// candidates/[id]/actions.ts) - nur candidate_files/candidate-files durch
// client_files/client-files ersetzt.
export async function uploadClientFileAction(
  clientId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const file = formData.get("file") as File | null
  if (!file) return { error: "Keine Datei ausgewählt." }

  const storagePath = `${clientId}/${Date.now()}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from("client-files")
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) return { error: uploadError.message }

  const { error: insertError } = await supabase.from("client_files").insert({
    client_id: clientId,
    file_name: file.name,
    file_path: storagePath,
    file_size: file.size,
    mime_type: file.type || null,
  })

  if (insertError) {
    await supabase.storage.from("client-files").remove([storagePath])
    return { error: insertError.message }
  }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

export async function deleteClientFileAction(
  fileId: string,
  storagePath: string,
  clientId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  await supabase.storage.from("client-files").remove([storagePath])

  const { error } = await supabase
    .from("client_files")
    .delete()
    .eq("id", fileId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}


// ============================================================
// Kunden-Portal: Zugaenge fuer externe Kunden-Logins verwalten. Nutzt bewusst den
// createSupabaseAdminClient() (Secret-Key/service_role) statt createSupabaseServerClient(),
// weil das Einladen eines neuen Auth-Users + Anlegen der zugehoerigen profiles-Zeile
// eine echte Admin-Operation ist, die nicht ueber die RLS-Rechte des aktuell
// eingeloggten Agentur-Mitarbeiters laufen kann (der darf ja gerade NICHT beliebige
// profiles-Zeilen mit fremder id anlegen).
export async function inviteClientPortalUserAction(
  clientId: string,
  email: string
): Promise<{ error: string } | null> {
  const trimmedEmail = email.trim()
  if (!trimmedEmail) return { error: "E-Mail-Adresse ist ein Pflichtfeld." }

  // Nur Staff, und der Kunde wird über die RLS-Session nachgeschlagen, damit nur Kunden der
  // eigenen Agentur infrage kommen (Security-Review 02.10.2026).
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle()
  if (!client) return { error: "Kunde nicht gefunden." }

  // Seit Paket 23 eigene Einladungs-Mail im einheitlichen Layout (mit Logo) statt der
  // Supabase-Standardmail; der Zugang selbst entsteht wie bei Ansprechpartnern.
  const access = await ensurePortalAccess(clientId, trimmedEmail)
  if ("error" in access) return { error: access.error }
  try {
    await sendPortalInvite(access.profileId, trimmedEmail.toLowerCase())
  } catch (err) {
    return { error: `Zugang angelegt, Einladung aber nicht verschickt: ${err instanceof Error ? err.message : err}` }
  }
  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

export async function removeClientPortalUserAction(
  profileId: string,
  clientId: string
): Promise<{ error: string } | null> {
  // Ohne diese Checks konnte jeder, der die Action-ID kennt, per profileId JEDEN
  // Account löschen - auch Team-/Admin-Zugänge (Security-Review 02.10.2026). Jetzt nur
  // Staff, und nur Portal-Zugänge (role "client") genau dieses Kunden der eigenen Agentur.
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle()
  if (!client) return { error: "Kunde nicht gefunden." }

  const admin = createSupabaseAdminClient()

  const { data: target } = await admin
    .from("profiles")
    .select("role, client_id")
    .eq("id", profileId)
    .maybeSingle()
  if (!target || target.role !== "client" || target.client_id !== clientId) {
    return { error: "Portal-Zugang nicht gefunden." }
  }

  const { error: profileError } = await admin.from("profiles").delete().eq("id", profileId)
  if (profileError) return { error: profileError.message }

  const { error: authError } = await admin.auth.admin.deleteUser(profileId)
  if (authError) return { error: authError.message }

  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}

// Passwort eines Portal-Zugangs zurücksetzen (Paket 20, T-91): Link per Mail senden oder
// zum Weitergeben anzeigen. Nur Staff, nur Portal-Zugänge genau dieses Kunden.
export async function portalPasswordResetAction(
  clientId: string,
  profileId: string,
  mode: "senden" | "kopieren"
): Promise<{ error: string } | { link?: string; sentTo?: string; kind?: "einladung" | "passwort" }> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle()
  if (!client) return { error: "Kunde nicht gefunden." }

  const admin = createSupabaseAdminClient()
  const { data: target } = await admin.from("profiles").select("role, client_id, email").eq("id", profileId).maybeSingle()
  if (!target || target.role !== "client" || target.client_id !== clientId) return { error: "Portal-Zugang nicht gefunden." }
  const email = target.email ?? (await admin.auth.admin.getUserById(profileId)).data.user?.email ?? null
  if (!email) return { error: "Für diesen Zugang ist keine E-Mail-Adresse bekannt." }

  try {
    if (mode === "kopieren") return { link: await createPasswordResetLink(email) }
    // Noch nie angemeldet -> Einladung, sonst Passwort-Link (Paket 23).
    const kind = await sendPortalInvite(profileId, email)
    return { sentTo: email, kind }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// Ansprechpartner einladen (Paket 23, T-95): legt den Portal-Zugang an, falls noch nicht
// vorhanden, und schickt die Einladung bzw. - wenn schon aktiv - einen Passwort-Link.
export async function inviteContactAction(clientId: string, contactId: string): Promise<{ error: string } | { sent: "einladung" | "passwort"; email: string }> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { data: contact } = await supabase.from("client_contacts").select("email").eq("id", contactId).eq("client_id", clientId).maybeSingle()
  const email = contact?.email?.trim().toLowerCase()
  if (!email) return { error: "Für diesen Ansprechpartner ist keine E-Mail-Adresse hinterlegt." }
  const access = await ensurePortalAccess(clientId, email)
  if ("error" in access) return { error: access.error }
  try {
    const sent = await sendPortalInvite(access.profileId, email)
    revalidatePath(`/dashboard/clients/${clientId}`)
    return { sent, email }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
