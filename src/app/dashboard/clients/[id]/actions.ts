"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext, requireStaffUser } from "@/lib/auth-guards"
import { fetchAllCustomers, importNewLeadtableCampaignsForClient } from "@/lib/leadtable-import-customers"
import { geocodePlz } from "@/lib/geocode-plz"
import { reverseGeocodeCity } from "@/lib/reverse-geocode"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { ensureCampaignAssignment } from "@/lib/client-assignment"
import {
  rankAvailableCandidates,
  type AvailableCandidate,
  type AvailableSort,
  type CandidateRow,
} from "@/lib/available-candidates"

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
  const plz = formData.get("plz") as string
  const auto_forward_enabled = formData.get("auto_forward_enabled") === "true"

  if (!name) return { error: "Firmenname ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  // PLZ wird immer als Rohwert gespeichert, auch wenn sie nicht in der Lookup-Tabelle
  // gefunden wird (geocodePlz gibt dann null zurück) - lat/lng bleiben in dem Fall
  // leer statt eines Fehlers, siehe geocode-plz.ts (gleiches Muster wie bei
  // Kandidaten/Kampagnen, candidates/actions.ts bzw. campaigns/actions.ts).
  const coords = plz ? geocodePlz(plz) : null

  // Ortsname nur EINMAL beim Speichern per Nominatim ermitteln (nicht bei jedem
  // Seitenaufruf) - und auch nur, wenn die PLZ überhaupt erfolgreich geocodiert wurde.
  // Schlägt die Anfrage fehl, bleibt ort einfach null - blockiert nicht das Speichern
  // von PLZ/lat/lng, die bereits erfolgreich ermittelt wurden (siehe reverse-geocode.ts).
  const ort = coords ? await reverseGeocodeCity(coords.lat, coords.lng) : null

  const { error } = await supabase
    .from("clients")
    .update({
      name,
      contact_email: contact_email || null,
      phone: phone || null,
      active,
      plz: plz || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      ort,
      auto_forward_enabled,
    })
    .eq("id", clientId)

  if (error) return { error: error.message }

  // Kampagnen ohne eigene PLZ übernehmen automatisch die (neue) Kunden-PLZ inkl.
  // lat/lng/location_id. Kampagnen, die bereits eine eigene PLZ haben, bleiben
  // unangetastet, damit eine manuell abweichend gesetzte Kampagnen-PLZ dauerhaft
  // erhalten bleibt, auch wenn sich die Kunden-PLZ später nochmal ändert. Nicht fatal
  // bei Fehlern - der Kunde ist zu diesem Zeitpunkt bereits erfolgreich gespeichert
  // (gleiches "loggen statt abbrechen"-Muster wie beim Matching-Aufruf in
  // campaigns/actions.ts).
  try {
    const { data: campaignsWithoutPlz, error: campaignsFetchError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("client_id", clientId)
      .is("plz", null)

    if (campaignsFetchError) throw new Error(campaignsFetchError.message)

    if (campaignsWithoutPlz && campaignsWithoutPlz.length > 0) {
      const location_id = await getOrCreateLocationForPlz(supabase, plz)

      const { error: campaignsUpdateError } = await supabase
        .from("campaigns")
        .update({
          plz: plz || null,
          lat: coords?.lat ?? null,
          lng: coords?.lng ?? null,
          location_id,
        })
        .in("id", campaignsWithoutPlz.map((c) => c.id))

      if (campaignsUpdateError) throw new Error(campaignsUpdateError.message)
    }
  } catch (cascadeError) {
    console.error("PLZ-Vererbung an Kampagnen fehlgeschlagen für Kunde", clientId, cascadeError)
  }

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

export async function refreshLeadtableClientAction(
  clientId: string
): Promise<
  { success: true; newCampaigns: number; archived: boolean } | { success: false; error: string }
> {
  const supabase = await createSupabaseServerClient()

  // Nur Staff - ruft externe Dienste bzw. schreibt mit Service-Role-Rechten
  // (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return { success: false, error: staffError.error }

  const { data: client, error: fetchError } = await supabase
    .from("clients")
    .select("id, active, leadtable_customer_id")
    .eq("id", clientId)
    .single()

  if (fetchError || !client) return { success: false, error: "Kunde nicht gefunden." }
  if (!client.leadtable_customer_id) {
    return { success: false, error: "Keine Leadtable-Kunden-ID hinterlegt, kein Abgleich möglich." }
  }

  // Archiviert-Status: kein Single-Item-GET bei Leadtable für einen Kunden, nur
  // /customer/all als Liste (siehe fetchAllCustomers) - deshalb komplette Kundenliste
  // laden und per _id filtern (gleiches Muster wie bei fetchAllCampaigns).
  let archived = false

  try {
    const leadtableCustomers = await fetchAllCustomers()
    const match = leadtableCustomers.find((c) => c._id === client.leadtable_customer_id)
    archived = match?.archived ?? false
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Leadtable-API-Fehler beim Archiviert-Check: ${message}` }
  }

  if (archived && client.active) {
    const { error: archiveError } = await supabase
      .from("clients")
      .update({ active: false })
      .eq("id", clientId)
    if (archiveError) return { success: false, error: `Fehler beim Archivieren: ${archiveError.message}` }
  }

  let importResult
  try {
    importResult = await importNewLeadtableCampaignsForClient(clientId, client.leadtable_customer_id)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: `Import neuer Kampagnen fehlgeschlagen: ${message}` }
  }

  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/clients")

  return { success: true, newCampaigns: importResult.campaignsCreated, archived }
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

// ============================================================
// Verfügbare Kandidaten im Kundenprofil (Atlas T-33, Zielbild T-31): immer bezogen auf
// eine KANZLEI-KAMPAGNE dieses Kunden - gleiches Berufsbild, im Umkreis um den Standort
// der Kampagne, noch nicht dieser Kampagne zugeordnet. Ohne Kampagne gibt es nichts
// zuzuordnen (die Kampagne beschreibt, wen die Kanzlei sucht).
// Filter laufen in der DB, Entfernung/Umkreis/Sortierung in rankAvailableCandidates().
// Obergrenze MAX_CANDIDATE_ROWS hält die Abfrage klein; bei deutlich mehr Kandidaten
// müsste die Umkreissuche in die DB wandern.
// Gleicher Wert wie in candidates/page.tsx ("Archiviert" ist ein Status, kein eigenes Feld).
const ARCHIVED_STATUS = "Archiviert"
const AVAILABLE_PAGE_SIZE = 20
const MAX_CANDIDATE_ROWS = 3000

async function loadClientKanzleiCampaign(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clientId: string,
  campaignId: string
) {
  const { data } = await supabase
    .from("campaigns")
    .select("id, title, berufsbild, lat, lng, radius_km, kind, client_id, status")
    .eq("id", campaignId)
    .eq("client_id", clientId)
    .eq("kind", "kanzlei")
    .maybeSingle()
  return data
}

export async function searchAvailableCandidatesAction(
  clientId: string,
  filters: {
    campaignId: string
    q: string
    status: string
    radius: "kampagne" | "alle" | number // Umkreis der Kampagne, ohne Grenze oder km
    sort: AvailableSort
    page: number
  }
): Promise<
  | { error: string }
  | {
      items: AvailableCandidate[]
      total: number
      totalPages: number
      page: number
      truncated: boolean
      campaignHasLocation: boolean
      effectiveRadiusKm: number | null
    }
> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const campaign = await loadClientKanzleiCampaign(supabase, clientId, filters.campaignId)
  if (!campaign) return { error: "Kampagne nicht gefunden." }
  if (!campaign.berufsbild) return { error: "Für diese Kampagne ist kein Berufsbild hinterlegt." }

  let query = supabase
    .from("candidates")
    .select("id, first_name, last_name, email, plz, lat, lng, berufsbild, status, source, created_at")
    .neq("status", ARCHIVED_STATUS)
    .eq("berufsbild", campaign.berufsbild)
    .order("created_at", { ascending: false })
    .limit(MAX_CANDIDATE_ROWS)

  // Zeichen entfernen, die in der PostgREST-or()-Syntax eine Bedeutung haben.
  const q = filters.q.replace(/[%,()"\\*]/g, " ").trim()
  if (q) query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,plz.ilike.${q}%`)
  if (filters.status && filters.status !== "alle") query = query.eq("status", filters.status)

  const [{ data: rows, error }, { data: assigned }] = await Promise.all([
    query,
    supabase.from("client_assignments").select("candidate_id").eq("campaign_id", campaign.id).is("removed_at", null),
  ])
  if (error) return { error: error.message }

  const effectiveRadiusKm =
    filters.radius === "kampagne" ? campaign.radius_km : filters.radius === "alle" ? null : filters.radius
  const ranked = rankAvailableCandidates((rows ?? []) as CandidateRow[], new Set((assigned ?? []).map((a) => a.candidate_id)), {
    clientLat: campaign.lat,
    clientLng: campaign.lng,
    radiusKm: effectiveRadiusKm,
    sort: filters.sort,
    page: filters.page,
    pageSize: AVAILABLE_PAGE_SIZE,
  })

  return {
    ...ranked,
    truncated: (rows ?? []).length >= MAX_CANDIDATE_ROWS,
    campaignHasLocation: campaign.lat !== null && campaign.lng !== null,
    effectiveRadiusKm,
  }
}

// Ein-Klick-Zuordnung aus "Verfügbare Kandidaten" zu einer Kanzlei-Kampagne dieses
// Kunden - idempotent über ensureCampaignAssignment.
export async function assignCandidateToClientCampaignAction(
  clientId: string,
  campaignId: string,
  candidateId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const campaign = await loadClientKanzleiCampaign(supabase, clientId, campaignId)
  if (!campaign) return { error: "Kampagne nicht gefunden." }

  try {
    await ensureCampaignAssignment(supabase, candidateId, campaignId, guard.staff.userId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }

  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Zugeordnet zu Kampagne „${campaign.title}“ (aus dem Kundenprofil)`,
    created_by: guard.staff.userId,  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}
