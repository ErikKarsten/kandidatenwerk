"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { geocodePlz } from "@/lib/geocode-plz"
import { matchCandidateToCampaigns } from "@/lib/matching"
import { notifyLeadRecipients } from "@/lib/lead-notifications"
import { triggerAutomationsNow } from "@/lib/automation-trigger"
import { RECALL_STATUS, RECALL_TASK_TITLE, recallDueDate } from "@/lib/candidate-status"
import { ASSIGNABLE_STATUS, clientNotLiveError, ensureCampaignAssignment } from "@/lib/client-assignment"
import { createSampleCandidates } from "@/lib/sample-candidates"
import { friendlyAiError } from "@/lib/llm"
import { cleanExtra, cleanFocus, cleanSoftware } from "@/lib/sample-focus"
import { canCreateSamples } from "@/lib/teams"

export type CreateCandidateState = { error: string } | null

export async function createCandidateAction(
  _prev: CreateCandidateState,
  formData: FormData
): Promise<CreateCandidateState> {
  const first_name = formData.get("first_name") as string
  const last_name = formData.get("last_name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const status = (formData.get("status") as string) || "neu"
  const source = "manual"
  const notes = formData.get("notes") as string
  const campaign_id = formData.get("campaign_id") as string
  const berufsbild = formData.get("berufsbild") as string
  const plz = formData.get("plz") as string
  const redirect_to = (formData.get("redirect_to") as string) || "/dashboard/candidates"

  if (!first_name) return { error: "Vorname ist ein Pflichtfeld." }
  if (!last_name) return { error: "Nachname ist ein Pflichtfeld." }

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const coords = plz ? geocodePlz(plz) : null

  // Kanzlei-Kampagne (Paket 53): nicht als Herkunft speichern, sondern zuordnen - sonst
  // erscheint der Kandidat nicht in der Kampagne. Kanzleien sehen nur vorqualifizierte.
  const { data: targetCampaign } = campaign_id
    ? await supabase.from("campaigns").select("id, kind, title, client_id").eq("id", campaign_id).maybeSingle()
    : { data: null }
  const kanzleiCampaign = targetCampaign?.kind === "kanzlei" ? targetCampaign : null
  if (kanzleiCampaign && status !== ASSIGNABLE_STATUS) {
    return { error: "Kanzleien sehen nur vorqualifizierte Kandidaten – bitte den Status „Vorqualifiziert“ wählen oder ohne Kampagne anlegen." }
  }
  // Vor dem Anlegen prüfen, sonst entstünde der Kandidat ohne die gewünschte Zuordnung.
  if (kanzleiCampaign?.client_id) {
    const notLive = await clientNotLiveError(supabase, kanzleiCampaign.client_id)
    if (notLive) return { error: `${notLive} Bitte ohne Kampagne anlegen oder die Phase der Kanzlei ändern.` }
  }

  const { data: candidate, error } = await supabase
    .from("candidates")
    .insert({
      first_name,
      last_name,
      email: email || null,
      phone: phone || null,
      status,
      source,
      notes: notes || null,
      campaign_id: kanzleiCampaign ? null : campaign_id || null,
      berufsbild: berufsbild || null,
      plz: plz || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  if (kanzleiCampaign) {
    try {
      await ensureCampaignAssignment(supabase, candidate.id, kanzleiCampaign.id, user.id)
      await supabase.from("candidate_history").insert({
        candidate_id: candidate.id,
        type: "note",
        content: `Angelegt und zugeordnet zu Kampagne „${kanzleiCampaign.title}“`,
        created_by: user.id,
      })
    } catch (assignError) {
      return { error: `Kandidat angelegt, Zuordnung fehlgeschlagen: ${assignError instanceof Error ? assignError.message : assignError}` }
    }
  }

  try {
    await matchCandidateToCampaigns(supabase, candidate.id)
  } catch (matchError) {
    console.error("Matching fehlgeschlagen für Kandidat", candidate.id, matchError)
  }

  // Keine automatische Kanzlei-Zuordnung beim Anlegen (Paket 19, T-86).

  try {
    await notifyLeadRecipients(candidate.id, `${first_name} ${last_name}`.trim())
  } catch (notifyError) {
    console.error("Lead-Benachrichtigung fehlgeschlagen für Kandidat", candidate.id, notifyError)
  }

  if (campaign_id) triggerAutomationsNow([campaign_id])
  redirect(redirect_to)
}

export async function updateCandidateStatusAction(
  candidateId: string,
  status: string,
  campaignId?: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: existing } = await supabase
    .from("candidates")
    .select("status, campaign_id")
    .eq("id", candidateId)
    .single()

  const { error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", candidateId)

  if (error) return { error: error.message }

  if (existing) {
    await supabase.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "status_change",
      content: `Status geändert: ${existing.status} → ${status}`,
      created_by: user.id,
    })
  }

  // "Derzeit nicht auf Suche" (Paket 85): in 6 Monaten erneut anrufen. Gibt es die Aufgabe
  // schon offen, rückt nur ihr Termin nach hinten.
  if (existing && existing.status !== status && status === RECALL_STATUS) {
    const due = recallDueDate()
    const { data: open } = await supabase
      .from("tasks")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("title", RECALL_TASK_TITLE)
      .neq("status", "erledigt")
      .limit(1)
      .maybeSingle()
    const { error: taskError } = open
      ? await supabase.from("tasks").update({ due_date: due }).eq("id", open.id)
      : await supabase.from("tasks").insert({
          title: RECALL_TASK_TITLE,
          description: `Status am ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} auf „Derzeit nicht auf Suche“ gesetzt. Nachfragen, ob sich die Lage geändert hat und ein Wechsel jetzt in Frage kommt.`,
          assigned_to: user.id,
          created_by: user.id,
          candidate_id: candidateId,
          due_date: due,
        })
    if (taskError) console.error("Aufgabe erneut anrufen fehlgeschlagen:", taskError.message)
    else {
      await supabase.from("candidate_history").insert({
        candidate_id: candidateId,
        type: "note",
        content: `Aufgabe „Kandidat erneut anrufen“ zum ${new Date(`${due}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })} angelegt.`,
        created_by: user.id,
      })
      revalidatePath("/dashboard/tasks")
    }
  }

  // Die frühere automatische Kunden-Benachrichtigung bei "vorqualifiziert" (Haken in den
  // Stammdaten) ist entfallen (Paket 16) - das übernehmen die Automatisierungen, seit
  // Paket 22 sofort: Herkunftskampagne und zugeordnete Kanzlei-Kampagnen.
  if (existing && existing.status !== status) {
    const { data: assigned } = await supabase.from("client_assignments").select("campaign_id").eq("candidate_id", candidateId).is("removed_at", null)
    triggerAutomationsNow([existing.campaign_id, ...(assigned ?? []).map((a) => a.campaign_id)])
  }

  if (campaignId) revalidatePath(`/dashboard/campaigns/${campaignId}`)
  revalidatePath("/dashboard/candidates")
  revalidatePath(`/dashboard/candidates/${candidateId}`)

  return null
}

// Drei Musterdatensätze per KI (Paket 41) - Berufsbild und PLZ des Kunden, dazu
// Schwerpunkte, Allrounder, Kanzleisoftware und Zusatzinfos (Paket 62).
export async function createSampleCandidatesAction(input: {
  berufsbild: string
  plz: string
  focus?: string[]
  allrounder?: boolean
  software?: string
  extra?: string
}): Promise<{ error: string } | { count: number }> {
  const { berufsbild, plz } = input
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { data: { user } } = await supabase.auth.getUser()
  const { data: me } = user ? await supabase.from("profiles").select("role, team").eq("id", user.id).maybeSingle() : { data: null }
  if (!canCreateSamples(me)) return { error: "Musterdatensätze können nur Admins und der Vertrieb anlegen." }
  const cleanPlz = plz.trim()
  if (!/^\d{5}$/.test(cleanPlz) || !geocodePlz(cleanPlz)) return { error: "Bitte eine gültige PLZ eingeben." }
  try {
    const ids = await createSampleCandidates(
      supabase,
      {
        berufsbild,
        plz: cleanPlz,
        focus: cleanFocus(input.focus),
        allrounder: input.allrounder === true,
        software: cleanSoftware(input.software),
        extra: cleanExtra(input.extra),
      },
      user?.id ?? null
    )
    revalidatePath("/dashboard/candidates")
    return { count: ids.length }
  } catch (err) {
    console.error("Musterdatensätze fehlgeschlagen:", err)
    return { error: friendlyAiError(err, "Musterdatensätze konnten nicht erstellt werden.") }
  }
}
