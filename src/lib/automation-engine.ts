import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { renderEmailLayout } from "@/lib/email-layout"
import { isKs24Campaign } from "@/lib/meta-campaigns-parse"

// #Kampagnenname in Mails an Kandidaten (Paket 46): interne Meta-Kampagnennamen wie
// "KS24 - Video Neele - Region Essen/ …" nie zeigen, stattdessen die Stelle (Berufsbild).
// Kanzlei-Kampagnen tragen schon einen Stellentitel ("Steuerfachangestellte (m/w/d) – Bonn").
export function mailCampaignName(campaign: { title?: string | null; kind?: string | null } | null | undefined, berufsbildLabel?: string | null): string {
  const title = campaign?.title?.trim() ?? ""
  if (title && campaign?.kind !== "lead" && !isKs24Campaign(title)) return title
  return berufsbildLabel ? `${berufsbildLabel} (m/w/d)` : "Fachkraft in einer Steuerkanzlei"
}

type Supabase = SupabaseClient<Database>

export interface TemplateVars {
  Kandidatenname: string
  Kampagnenname: string
  Kundenname: string
  Email: string
  Telefon: string
  Bewerberlink: string
}

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

// Direktlink auf den Kandidaten im Kundenportal (Paket 16, T-76, Variable #Bewerberlink).
export function candidatePortalLink(candidateId: string): string {
  return `${APP_BASE_URL}/portal/candidates/${candidateId}`
}

export function usesCandidateLink(automation: { subject: string; body_html: string }): boolean {
  return `${automation.subject}\n${automation.body_html}`.includes("#Bewerberlink")
}

// Ersetzt die in automations-tab.tsx dokumentierten Platzhalter (#Kandidatenname,
// #Kampagnenname, #Kundenname, #Email, #Telefon, #Bewerberlink) in Betreff/Text. Unbekannte
// #Platzhalter (Tippfehler etc.) bleiben absichtlich unverändert stehen statt
// stillschweigend zu leerem String zu werden - fällt beim Testen eher auf.
export function substituteTemplateVars(text: string, vars: TemplateVars): string {
  return text
    .replaceAll("#Bewerberlink", vars.Bewerberlink)
    .replaceAll("#Kandidatenname", vars.Kandidatenname)
    .replaceAll("#Kampagnenname", vars.Kampagnenname)
    .replaceAll("#Kundenname", vars.Kundenname)
    .replaceAll("#Email", vars.Email)
    .replaceAll("#Telefon", vars.Telefon)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Wandelt reinen Fließtext (Leerzeile = neuer Absatz, einfacher Zeilenumbruch = <br>
// innerhalb eines Absatzes - siehe die \n\n-Vorlagen in automations-tab.tsx) in
// escapetes HTML um, bevor es in die Kartenvorlage unten eingebettet wird.
function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .map((paragraph) => `<p style="margin:0 0 14px;">${linkify(escapeHtml(paragraph)).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

// Links klickbar machen; der Bewerberlink erscheint als "Bewerberprofil öffnen".
function linkify(html: string): string {
  return html.replace(/https:\/\/[^\s<]+/g, (url) => {
    const label = url.startsWith(`${APP_BASE_URL}/portal/candidates/`) ? "Bewerberprofil öffnen" : url
    return `<a href="${url}" style="color:#1e56a0;font-weight:600;">${label}</a>`
  })
}

// Verpackt den fertig durch substituteTemplateVars ersetzten Mailtext in die gebrandete
// Kartenvorlage - weiße Karte, blauer "Kandidatenwerk"-Header, dezente Fußzeile. Der Editor/die
// Texteingabe in automations-tab.tsx bleibt reiner Fließtext, nur der Versand hier
// rendert Absätze/Zeilenumbrüche jetzt als HTML statt sie 1:1 unformatiert an Brevo
// weiterzureichen.
export function wrapAutomationEmailHtml(bodyText: string, footerSender?: string | null): string {
  // Gleiches Layout wie alle anderen Mails (Paket 19, T-87).
  return renderEmailLayout({ contentHtml: textToHtmlParagraphs(bodyText), footerSender })
}

// Empfänger-Auflösung für die 3 Recipient-Optionen aus automations-tab.tsx.
// "client": bevorzugt Portal-Login-Adressen des Kunden, sonst clients.contact_email
// ("primärer Ansprechpartner", siehe UI-Label).
export async function resolveAutomationRecipients(
  supabase: Supabase,
  recipient: string,
  candidate: { email: string | null; client_id: string | null }
): Promise<string[]> {
  if (recipient === "candidate") {
    return candidate.email ? [candidate.email] : []
  }

  if (!candidate.client_id) return []

  if (recipient === "client") {
    const { data: portalProfiles } = await supabase
      .from("profiles")
      .select("email")
      .eq("client_id", candidate.client_id)
      .eq("role", "client")

    const portalEmails = (portalProfiles ?? [])
      .map((p) => p.email)
      .filter((e): e is string => Boolean(e))

    if (portalEmails.length > 0) return portalEmails

    const { data: client } = await supabase
      .from("clients")
      .select("contact_email")
      .eq("id", candidate.client_id)
      .single()

    return client?.contact_email ? [client.contact_email] : []
  }

  if (recipient === "all_contacts") {
    const { data: contacts } = await supabase
      .from("client_contacts")
      .select("email")
      .eq("client_id", candidate.client_id)

    return (contacts ?? [])
      .map((c) => c.email)
      .filter((e): e is string => Boolean(e))
  }

  return []
}
