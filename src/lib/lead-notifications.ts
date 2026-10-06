import { createSupabaseAdminClient } from "./supabase-admin"
import { sendEmail } from "./brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Benachrichtigt die in Einstellungen -> Automatisierung konfigurierten Team-Mitglieder
// per Mail über einen neu angelegten Kandidaten - aufgerufen an allen 3 Stellen, an
// denen ein Kandidat neu entsteht (manuelle Anlage, Meta-Leads, Leadtable-Import),
// analog zu ensureClientAssignment (client-assignment.ts). Nutzt bewusst den
// Service-Role-Client statt des Aufrufer-Clients: läuft teils aus reinen Node-Scripts
// ohne eingeloggte Session (Meta-/Leadtable-Sync), und muss fehlende profiles.email per
// Admin-API nachschlagen (gleiches Muster wie getTeamMembers in
// einstellungen/actions.ts - profiles.email ist bei bestehenden Team-Profilen NULL).
//
// Empfänger werden auf die Agentur des Kandidaten gefiltert (über Kunde bzw. Kampagne
// -> clients.agency_id, Atlas T-11, 02.10.2026). Lässt sich keine Agentur ermitteln
// (z.B. manuell angelegt ohne Kampagne/Kunde), gehen wie bisher alle konfigurierten
// Empfänger raus - lieber eine Mail zu viel als ein verpasster Lead.
//
// Wirft bei Fehlern, statt sie zu schlucken - der Aufrufer entscheidet (wie bei
// ensureClientAssignment), ob und wie das geloggt wird, damit ein Fehler hier nie die
// eigentliche Kandidatenanlage scheitern lässt.
async function resolveCandidateAgencyId(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  candidateId: string
): Promise<string | null> {
  const { data: candidate } = await admin
    .from("candidates")
    .select("client_id, campaign_id")
    .eq("id", candidateId)
    .maybeSingle()
  if (!candidate) return null

  let clientId = candidate.client_id
  if (!clientId && candidate.campaign_id) {
    const { data: campaign } = await admin
      .from("campaigns")
      .select("client_id, agency_id")
      .eq("id", candidate.campaign_id)
      .maybeSingle()
    // Lead-Kampagnen (T-36) haben keinen Kunden, aber direkt eine Agentur.
    if (campaign?.agency_id) return campaign.agency_id
    clientId = campaign?.client_id ?? null
  }
  if (!clientId) return null

  const { data: client } = await admin.from("clients").select("agency_id").eq("id", clientId).maybeSingle()
  return client?.agency_id ?? null
}

export async function notifyLeadRecipients(candidateId: string, candidateName: string): Promise<void> {
  const admin = createSupabaseAdminClient()

  const agencyId = await resolveCandidateAgencyId(admin, candidateId)
  let recipientsQuery = admin.from("lead_notification_recipients").select("profile_id")
  if (agencyId) recipientsQuery = recipientsQuery.eq("agency_id", agencyId)

  const { data: recipientRows, error: recipientsError } = await recipientsQuery
  if (recipientsError) throw new Error(recipientsError.message)
  if (!recipientRows || recipientRows.length === 0) return

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id, email")
    .in("id", recipientRows.map((r) => r.profile_id))
  if (profilesError) throw new Error(profilesError.message)

  const emails: string[] = []
  for (const p of profiles ?? []) {
    if (p.email) {
      emails.push(p.email)
      continue
    }
    const { data } = await admin.auth.admin.getUserById(p.id)
    if (data.user?.email) emails.push(data.user.email)
  }
  if (emails.length === 0) return

  const link = `${APP_BASE_URL}/dashboard/candidates/${candidateId}`
  const subject = `Neuer Lead: ${candidateName}`
  const html = renderEmailLayout({
    heading: `Neuer Lead: ${escapeHtml(candidateName)}`,
    contentHtml: `<p style="margin:0;text-align:center;">Ein neuer Kandidat wurde soeben angelegt.</p>${emailButton(link, "Kandidat ansehen")}`,
  })

  await sendEmail(emails, subject, html)
}
