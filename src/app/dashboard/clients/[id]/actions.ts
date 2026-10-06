"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { publishClientProfileToKanzleistelle } from "@/lib/kanzleistelle-profile-sync"
import { scheduleKanzleistelleSync } from "@/lib/kanzleistelle-auto-sync"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

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

  // Ohne diesen Check konnte jeder, der die Action-ID kennt (steht im ausgelieferten
  // JS), sich selbst einen Portal-Zugang zu einem beliebigen Kunden anlegen
  // (Security-Review 02.10.2026). Der Kunde wird über die RLS-Session nachgeschlagen,
  // damit nur Kunden der eigenen Agentur infrage kommen.
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle()
  if (!client) return { error: "Kunde nicht gefunden." }

  const admin = createSupabaseAdminClient()

  // Vorab prüfen, ob diese E-Mail bereits als Portal-Zugang existiert (unabhängig vom
  // Kunden) - Supabase Auth's inviteUserByEmail() ist pro E-Mail idempotent: ein
  // zweiter Aufruf für eine schon bestehende (auch nur eingeladene, unbestätigte)
  // E-Mail legt KEINEN neuen Auth-User an, sondern liefert die ID des bestehenden
  // zurück und verschickt trotzdem einen neuen, echten Einladungslink dafür. Der
  // anschließende profiles-Insert würde dann am Primary-Key scheitern (die ID hat ja
  // schon eine profiles-Zeile vom ersten Zugang), und der Cleanup-Pfad unten würde
  // diesen BESTEHENDEN Auth-User wieder löschen - nicht nur die neue Einladung wäre
  // damit tot, der schon funktionierende erste Portal-Zugang würde rückwirkend
  // zerstört (siehe Diagnose vom 21.09.2026, live reproduziert). Deshalb hier vorher
  // abfangen, bevor überhaupt eine E-Mail verschickt wird.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, client_id")
    .eq("email", trimmedEmail)
    .maybeSingle()

  if (existingProfile) {
    return {
      error: `Diese E-Mail-Adresse ist bereits als Portal-Zugang hinterlegt (Kunde-ID ${existingProfile.client_id}). Bitte dort entfernen, bevor sie hier erneut eingeladen wird.`,
    }
  }

  // agency_id bewusst NICHT setzen (bleibt NULL) - mehrere "eigene Agentur"-RLS-Policies
  // (clients, candidates, client_contacts, client_files, campaign_automations, profiles,
  // Storage-Buckets) gehen davon aus, dass Portal-Kunden agency_id = NULL haben, sonst
  // sehen sie systemweit alle Daten aller Agenturen statt nur ihre eigenen (Sicherheits-
  // vorfall vom 22.09.2026, live bestätigt - siehe 20260922000003_revert_client_portal_agency_id.sql).
  // Ein früherer Fix hatte hier agency_id vom Kunden übernommen, um ein internes Anzeige-
  // Problem zu lösen (Staff sah den Portal-Zugang in der eigenen Liste nicht) - das war
  // die falsche Abwägung. Der dauerhafte, sichere Fix für das Anzeige-Problem (Staff-
  // Sichtbarkeit ohne geteilte agency_id, z.B. Rollenprüfung in der Policy) folgt separat.
  const { data, error } = await admin.auth.admin.inviteUserByEmail(trimmedEmail, {
    redirectTo: "https://kandidatenwerk.kanzleistelle24.de/set-password",
  })

  if (error) return { error: error.message }
  if (!data.user) return { error: "Einladung konnte nicht erstellt werden." }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    role: "client",
    client_id: clientId,
    agency_id: null,
    email: trimmedEmail,
  })

  // Profil-Insert fehlgeschlagen (z.B. Constraint-Fehler) - den bereits eingeladenen
  // Auth-User wieder entfernen, damit kein verwaister Login ohne Profil zurueckbleibt,
  // der bei einem erneuten Einladungsversuch mit derselben Adresse einen verwirrenden
  // "schon eingeladen"-Fehler werfen wuerde.
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { error: profileError.message }
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
