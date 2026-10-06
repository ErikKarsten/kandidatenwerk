"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { geocodePlz } from "@/lib/geocode-plz"
import { getOrCreateLocationForPlz } from "@/lib/location-clustering"
import { matchCampaignToCandidates } from "@/lib/matching"
import { applyDefaultTemplateSet } from "@/lib/automation-templates"

export type CreateCampaignState = { error: string } | null

export async function createCampaignAction(
  _prev: CreateCampaignState,
  formData: FormData
): Promise<CreateCampaignState> {
  const title = formData.get("title") as string
  const client_id = formData.get("client_id") as string
  const description = formData.get("description") as string
  const status = (formData.get("status") as string) || "active"
  const meta_campaign_id = formData.get("meta_campaign_id") as string
  const berufsbildInput = formData.get("berufsbild") as string
  let plz = formData.get("plz") as string
  const radius_km_raw = formData.get("radius_km") as string

  if (!title) return { error: "Titel ist ein Pflichtfeld." }
  if (!client_id) return { error: "Kampagnen werden im Kundenprofil angelegt." }
  if (!berufsbildInput) return { error: "Bitte das gesuchte Berufsbild auswählen." }

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // Kampagne ohne eigene PLZ übernimmt sofort die PLZ des Kunden (falls vorhanden) -
  // analog zur Cascade-Logik in updateClientAction (clients/[id]/actions.ts), nur
  // umgekehrte Richtung. Hat auch der Kunde keine PLZ, bleibt die Kampagne wie bisher
  // ohne PLZ - kein Fehler.
  // Kunde über die RLS-Session prüfen (nur Kunden der eigenen Agentur).
  const { data: client } = await supabase.from("clients").select("plz").eq("id", client_id).maybeSingle()
  if (!client) return { error: "Kunde nicht gefunden." }
  if (!plz && client.plz) plz = client.plz

  const coords = plz ? geocodePlz(plz) : null
  const location_id = await getOrCreateLocationForPlz(supabase, plz)

  // Berufsbild ist seit Atlas T-32 Pflicht - eine Kanzlei-Kampagne beschreibt, wen die
  // Kanzlei sucht. Der frühere Vorschlag aus dem Titel entfällt damit.
  const berufsbild = berufsbildInput

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      title,
      client_id,
      kind: "kanzlei", // im Kundenprofil angelegt = Kanzlei-Kampagne (Atlas T-36)
      description: description || null,
      status,
      meta_campaign_id: meta_campaign_id || null,
      berufsbild,
      plz: plz || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      location_id,
      ...(radius_km_raw ? { radius_km: parseInt(radius_km_raw, 10) } : {}),
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  // Automatisierungen aus dem Standard-Vorlagenset, ausgeschaltet (Paket 15, T-74).
  await applyDefaultTemplateSet(supabase, campaign.id)

  try {
    await matchCampaignToCandidates(supabase, campaign.id)
  } catch (matchError) {
    console.error("Matching fehlgeschlagen für Kampagne", campaign.id, matchError)
  }

  // Zurück ins Kundenprofil, aus dem die Kampagne angelegt wurde (Atlas T-32).
  redirect(`/dashboard/clients/${client_id}`)
}
