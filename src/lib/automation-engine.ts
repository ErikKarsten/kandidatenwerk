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
