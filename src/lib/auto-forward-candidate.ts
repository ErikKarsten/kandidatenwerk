import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "./brevo-mail"

type Supabase = SupabaseClient<Database>

// 7 Tage - lang genug, dass der Kunden-Kontakt die Mail nicht sofort öffnen muss, aber
// zeitlich begrenzt statt eines dauerhaft gültigen Links (candidate-files ist ein
// privater Bucket, siehe supabase/migrations/20260608000002_storage_rls.sql).
const PDF_LINK_EXPIRY_SECONDS = 60 * 60 * 24 * 7

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Verschickt bei Wechsel auf "vorqualifiziert" automatisch eine Info-Mail an den
// Kunden, zu dem der Kandidat über seine Kampagne gehört - aber nur, wenn der Kunde
// das explizit aktiviert hat (clients.auto_forward_enabled) und eine Kontakt-E-Mail
// hinterlegt ist. Wird von updateCandidateStatusAction (candidates/actions.ts)
// aufgerufen, dort bereits in try/catch eingebettet: ein Fehler hier darf den
// Status-Wechsel selbst nicht scheitern lassen.
export async function autoForwardCandidateIfEnabled(
  supabase: Supabase,
  candidateId: string
): Promise<void> {
  const { data: candidate, error: candidateError } = await supabase
    .from("candidates")
    .select("first_name, last_name, email, phone, berufsbild, campaign_id")
    .eq("id", candidateId)
    .single()

  // Kein Kandidat gefunden, oder keiner Kampagne zugeordnet (z.B. manuell ohne
  // Kampagnen-Bezug angelegt) - kein Kunde ermittelbar, also nichts zu tun.
  if (candidateError || !candidate || !candidate.campaign_id) return

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("client_id")
    .eq("id", candidate.campaign_id)
    .single()

  if (!campaign?.client_id) return

  const { data: client } = await supabase
    .from("clients")
    .select("auto_forward_enabled, contact_email, contact_name, name")
    .eq("id", campaign.client_id)
    .single()

  if (!client) return
  if (!client.auto_forward_enabled) return
  if (!client.contact_email) return

  // Neuester PDF-Anhang (typischerweise der Lebenslauf) - falls vorhanden, als Link in
  // die Mail. Ohne passende Datei wird die Mail einfach ohne Anhangs-Link verschickt,
  // kein Fehlerfall.
  const { data: files } = await supabase
    .from("candidate_files")
    .select("file_path, file_name, mime_type")
    .eq("candidate_id", candidateId)
    .order("created_at", { ascending: false })

  const pdfFile = (files ?? []).find(
    (f) => f.mime_type === "application/pdf" || f.file_name.toLowerCase().endsWith(".pdf")
  )

  let pdfLink: string | null = null
  if (pdfFile) {
    const { data: signedUrlData } = await supabase.storage
      .from("candidate-files")
      .createSignedUrl(pdfFile.file_path, PDF_LINK_EXPIRY_SECONDS)
    pdfLink = signedUrlData?.signedUrl ?? null
  }

  const candidateName = `${candidate.first_name} ${candidate.last_name}`.trim()
  const greetingName = client.contact_name?.trim() || client.name

  const rows: string[] = [
    `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Name</td><td style="padding:4px 0;font-weight:500;">${escapeHtml(candidateName)}</td></tr>`,
  ]
  if (candidate.email) {
    rows.push(
      `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">E-Mail</td><td style="padding:4px 0;"><a href="mailto:${escapeHtml(candidate.email)}" style="color:#1e56a0;text-decoration:none;">${escapeHtml(candidate.email)}</a></td></tr>`
    )
  }
  if (candidate.phone) {
    rows.push(
      `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Telefon</td><td style="padding:4px 0;">${escapeHtml(candidate.phone)}</td></tr>`
    )
  }
  if (candidate.berufsbild) {
    rows.push(
      `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;">Berufsbild</td><td style="padding:4px 0;">${escapeHtml(candidate.berufsbild)}</td></tr>`
    )
  }

  const html = `
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,Helvetica,Arial,sans-serif;overflow:hidden;">
  <div style="padding:28px 28px 4px;">
    <div style="font-size:20px;font-weight:700;color:#1e56a0;">Kandidatenwerk</div>
    <div style="font-size:16px;font-weight:600;color:#111827;margin-top:6px;">Neuer vorqualifizierter Kandidat</div>
    <div style="font-size:13px;color:#6b7280;margin-top:10px;line-height:1.5;">
      Hallo ${escapeHtml(greetingName)}, ein Kandidat wurde soeben als "vorqualifiziert" markiert.
    </div>
  </div>
  <div style="padding:16px 28px 4px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${rows.join("")}
    </table>
    ${pdfLink ? `<p style="margin-top:16px;"><a href="${pdfLink}" style="color:#1e56a0;text-decoration:none;font-weight:500;">Lebenslauf öffnen (PDF)</a></p>` : ""}
  </div>
  <div style="padding:20px 28px 24px;margin-top:8px;border-top:1px solid #e5e7eb;">
    <div style="font-size:11px;color:#9ca3af;">Automatisch generiert von Kandidatenwerk</div>
  </div>
</div>
`.trim()

  await sendEmail(
    [client.contact_email],
    `Neuer vorqualifizierter Kandidat: ${candidateName}`,
    html
  )
}
