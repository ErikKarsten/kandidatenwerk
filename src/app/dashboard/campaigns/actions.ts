"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"

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

  if (!title) return { error: "Titel ist ein Pflichtfeld." }
  if (!client_id) return { error: "Bitte einen Kunden auswählen." }

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .insert({
      title,
      client_id,
      description: description || null,
      status,
      meta_campaign_id: meta_campaign_id || null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  await supabase.from("campaign_automations").insert([
    {
      campaign_id: campaign.id,
      name: "Eingangsbestätigung",
      trigger: "new_lead",
      trigger_status: null,
      delay_seconds: 30,
      active: false,
      recipient: "candidate",
      sender_email: "",
      sender_name: "",
      subject: "Deine Bewerbung als #Kampagnenname bei #Kundenname",
      body_html:
        "Hallo #Kandidatenname,\n\nvielen Dank für deine Bewerbung auf die Stelle als #Kampagnenname bei #Kundenname.\n\nWir haben deine Bewerbung erhalten und werden uns in den nächsten Stunden telefonisch bei dir melden.\n\nMit freundlichen Grüßen\n#Kundenname",
    },
    {
      campaign_id: campaign.id,
      name: "Neuer qualifizierter Lead",
      trigger: "status_change",
      trigger_status: "Vorqualifiziert",
      delay_seconds: 30,
      active: false,
      recipient: "client",
      sender_email: "",
      sender_name: "",
      subject: "Neuer qualifizierter Bewerber für #Kampagnenname",
      body_html:
        "Hallo,\n\nein neuer Bewerber wurde für die Kampagne #Kampagnenname vorqualifiziert.\n\nName: #Kandidatenname\nTelefon: #Telefon\nE-Mail: #Email\n\nBitte nehmen Sie zeitnah Kontakt auf.\n\nMit freundlichen Grüßen\nKandidatenwerk",
    },
    {
      campaign_id: campaign.id,
      name: "Nicht erreicht",
      trigger: "status_change",
      trigger_status: "2x nicht erreicht + Mail",
      delay_seconds: 30,
      active: false,
      recipient: "candidate",
      sender_email: "",
      sender_name: "",
      subject: "Ihre Bewerbung als #Kampagnenname",
      body_html:
        "Hallo #Kandidatenname,\n\nwir haben versucht Sie telefonisch zu erreichen, leider ohne Erfolg.\n\nWann können wir Sie heute oder morgen erreichen?\n\nMit freundlichen Grüßen\n#Kundenname",
    },
    {
      campaign_id: campaign.id,
      name: "Absage",
      trigger: "status_change",
      trigger_status: "Absage",
      delay_seconds: 30,
      active: false,
      recipient: "candidate",
      sender_email: "",
      sender_name: "",
      subject: "Rückmeldung zu deiner Bewerbung bei #Kundenname",
      body_html:
        "Hallo #Kandidatenname,\n\nvielen Dank für deine Bewerbung bei #Kundenname.\n\nNach sorgfältiger Prüfung müssen wir dir leider mitteilen, dass wir uns für andere Kandidaten entschieden haben.\n\nWir wünschen dir für deinen weiteren Weg alles Gute.\n\nHerzliche Grüße\n#Kundenname",
    },
  ])

  redirect("/dashboard/campaigns")
}
