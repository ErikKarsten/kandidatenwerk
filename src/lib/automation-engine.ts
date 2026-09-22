import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"

type Supabase = SupabaseClient<Database>

export interface TemplateVars {
  Kandidatenname: string
  Kampagnenname: string
  Kundenname: string
  Email: string
  Telefon: string
}

// Ersetzt die in automations-tab.tsx dokumentierten Platzhalter (#Kandidatenname,
// #Kampagnenname, #Kundenname, #Email, #Telefon) in Betreff/Text. Unbekannte
// #Platzhalter (Tippfehler etc.) bleiben absichtlich unverändert stehen statt
// stillschweigend zu leerem String zu werden - fällt beim Testen eher auf.
export function substituteTemplateVars(text: string, vars: TemplateVars): string {
  return text
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
    .map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("")
}

// Verpackt den fertig durch substituteTemplateVars ersetzten Mailtext in dieselbe
// gebrandete Kartenvorlage wie autoForwardCandidateIfEnabled (auto-forward-candidate.ts)
// - weiße Karte, blauer "Kandidatenwerk"-Header, dezente Fußzeile. Der Editor/die
// Texteingabe in automations-tab.tsx bleibt reiner Fließtext, nur der Versand hier
// rendert Absätze/Zeilenumbrüche jetzt als HTML statt sie 1:1 unformatiert an Brevo
// weiterzureichen.
export function wrapAutomationEmailHtml(bodyText: string): string {
  return `
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,Helvetica,Arial,sans-serif;overflow:hidden;">
  <div style="padding:28px 28px 4px;">
    <div style="font-size:20px;font-weight:700;color:#1e56a0;">Kandidatenwerk</div>
  </div>
  <div style="padding:16px 28px 4px;font-size:14px;color:#111827;line-height:1.6;">
    ${textToHtmlParagraphs(bodyText)}
  </div>
  <div style="padding:20px 28px 24px;margin-top:8px;border-top:1px solid #e5e7eb;">
    <div style="font-size:11px;color:#9ca3af;">Automatisch generiert von Kandidatenwerk</div>
  </div>
</div>
`.trim()
}

// Empfänger-Auflösung für die 3 Recipient-Optionen aus automations-tab.tsx.
// "client" folgt demselben Muster wie autoForwardCandidateIfEnabled
// (auto-forward-candidate.ts): bevorzugt Portal-Login-Adressen des Kunden, sonst
// clients.contact_email ("primärer Ansprechpartner", siehe UI-Label) - bewusst
// dieselbe Logik, damit Kunden-Mails an derselben Adresse landen.
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
