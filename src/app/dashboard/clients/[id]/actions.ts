"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { fetchAllCustomers, importNewLeadtableCampaignsForClient } from "@/lib/leadtable-import-customers"
import { geocodePlz } from "@/lib/geocode-plz"
import { reverseGeocodeCity } from "@/lib/reverse-geocode"

export async function updateClientAction(
  clientId: string,
  formData: FormData
): Promise<{ error: string } | null> {
  const name = formData.get("name") as string
  const contact_email = formData.get("contact_email") as string
  const phone = formData.get("phone") as string
  const active = formData.get("active") === "true"
  const plz = formData.get("plz") as string

  if (!name) return { error: "Firmenname ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()

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
    })
    .eq("id", clientId)

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/clients/${clientId}`)
  revalidatePath("/dashboard/clients")
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: "Nicht eingeloggt." }

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
  const { error } = await supabase.from("client_contacts").delete().eq("id", contactId)

  if (error) return { error: error.message }
  revalidatePath(`/dashboard/clients/${clientId}`)
  return null
}
