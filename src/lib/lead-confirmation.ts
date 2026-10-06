// Zentrale Eingangsbestätigung an Kandidaten (Paket 23, T-93): Einstellungen >
// E-Mail-Vorlagen > "Eingangsbestätigung an Kandidaten". Gilt für alle importierten Leads
// (Meta-Lead-Formulare, Kanzleistelle24), nicht für von Hand angelegte; nur für Leads ab dem
// Einschalten, je Kandidat einmal (candidate_mail_runs, vor dem Versand reserviert).
// Läuft sofort im Meta-Webhook und als Absicherung im 5-Minuten-Job.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { substituteTemplateVars, wrapAutomationEmailHtml } from "@/lib/automation-engine"

type Db = SupabaseClient<Database>

export const IMPORT_SOURCES = ["meta_ads", "kanzleistelle24"]
const KIND = "eingangsbestaetigung"

export async function sendLeadConfirmations(db: Db, opts: { candidateIds?: string[] } = {}): Promise<{ sent: number; failed: number }> {
  const result = { sent: 0, failed: 0 }
  const { data: settings } = await db
    .from("agency_settings")
    .select("confirmation_active, confirmation_template_id, confirmation_active_since")
    .eq("confirmation_active", true)
    .limit(1)
    .maybeSingle()
  if (!settings?.confirmation_template_id || !settings.confirmation_active_since) return result
  const { data: template } = await db.from("automation_templates").select("subject, body_html").eq("id", settings.confirmation_template_id).maybeSingle()
  if (!template) return result

  let query = db
    .from("candidates")
    .select("id, first_name, last_name, email, phone, campaigns(title, clients(name))")
    .in("source", IMPORT_SOURCES)
    .eq("is_demo", false)
    .not("email", "is", null)
    .gte("created_at", settings.confirmation_active_since)
    .order("created_at")
    .limit(50)
  if (opts.candidateIds) query = query.in("id", opts.candidateIds)
  const { data: candidates, error } = await query
  if (error) throw new Error(error.message)
  if (!candidates?.length) return result

  const { data: done } = await db.from("candidate_mail_runs").select("candidate_id").eq("kind", KIND).in("candidate_id", candidates.map((c) => c.id))
  const doneIds = new Set((done ?? []).map((d) => d.candidate_id))

  for (const c of candidates.filter((x) => !doneIds.has(x.id))) {
    // Reservieren vor dem Versand - schlägt das fehl, hat ein paralleler Lauf ihn schon.
    const { error: claimError } = await db.from("candidate_mail_runs").insert({ kind: KIND, candidate_id: c.id })
    if (claimError) continue
    const campaign = (Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns) as { title: string; clients: { name: string } | { name: string }[] | null } | null
    const client = Array.isArray(campaign?.clients) ? campaign?.clients[0] : campaign?.clients
    const vars = {
      Kandidatenname: `${c.first_name} ${c.last_name}`.trim(),
      Kampagnenname: campaign?.title ?? "",
      Kundenname: client?.name ?? "",
      Email: c.email ?? "",
      Telefon: c.phone ?? "",
      Bewerberlink: "",
    }
    try {
      await sendEmail([c.email!], substituteTemplateVars(template.subject, vars), wrapAutomationEmailHtml(substituteTemplateVars(template.body_html, vars)))
      await db.from("candidate_history").insert({ candidate_id: c.id, type: "automation", content: `Eingangsbestätigung verschickt (Mail an ${c.email})` })
      result.sent++
    } catch (err) {
      await db.from("candidate_mail_runs").delete().eq("kind", KIND).eq("candidate_id", c.id)
      console.error("[eingangsbestaetigung]", c.id, err instanceof Error ? err.message : err)
      result.failed++
    }
  }
  return result
}
