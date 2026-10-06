// Mail an die Kanzlei, sobald ihr ein Kandidat zugeordnet wird (Paket 20, T-90). Zuordnen
// geht nur mit vorqualifizierten Kandidaten - die Zuordnung ist also der Moment, in dem die
// Kanzlei einen neuen Kandidaten bekommt. Text: E-Mail-Vorlagen mit Auslöser
// "Kandidat einer Kanzlei zugeordnet" (Einstellungen > E-Mail-Vorlagen), inkl. #Bewerberlink.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { candidatePortalLink, resolveAutomationRecipients, substituteTemplateVars, wrapAutomationEmailHtml } from "@/lib/automation-engine"

type Db = SupabaseClient<Database>

// Läuft mit Server-Rechten (Service-Role): Portal-Zugänge der Kanzlei sind für Team-Logins
// per RLS nicht lesbar - mit der Nutzer-Session landete die Mail deshalb immer bei der
// Kontakt-E-Mail statt bei den Portal-Zugängen (Fix Paket 21).
export async function notifyClientAboutAssignment(assignmentId: string, byUserId?: string | null, db: Db = createSupabaseAdminClient()): Promise<void> {
  try {
    const { data: a } = await db
      .from("client_assignments")
      .select("candidate_id, client_id, campaigns(title), clients(name), candidates(first_name, last_name, email, phone, is_demo)")
      .eq("id", assignmentId)
      .maybeSingle()
    if (!a) return
    const one = <T,>(rel: T | T[] | null) => (Array.isArray(rel) ? rel[0] ?? null : rel)
    const candidate = one(a.candidates as { first_name: string; last_name: string; email: string | null; phone: string | null; is_demo: boolean } | null)
    if (!candidate || candidate.is_demo) return

    const { data: templates } = await db.from("automation_templates").select("name, recipient, subject, body_html").eq("trigger", "client_assigned")
    if (!templates || templates.length === 0) return

    const vars = {
      Kandidatenname: `${candidate.first_name} ${candidate.last_name}`.trim(),
      Kampagnenname: one(a.campaigns as { title: string } | null)?.title ?? "",
      Kundenname: one(a.clients as { name: string } | null)?.name ?? "",
      Email: candidate.email ?? "",
      Telefon: candidate.phone ?? "",
      Bewerberlink: candidatePortalLink(a.candidate_id),
    }
    for (const t of templates) {
      const recipients = await resolveAutomationRecipients(db, t.recipient, { email: candidate.email, client_id: a.client_id })
      if (recipients.length === 0) {
        await db.from("candidate_history").insert({
          candidate_id: a.candidate_id,
          type: "note",
          content: `„${t.name}“ nicht verschickt: Für ${vars.Kundenname || "die Kanzlei"} ist keine E-Mail-Adresse hinterlegt.`,
        })
        continue
      }
      await sendEmail(recipients, substituteTemplateVars(t.subject, vars), wrapAutomationEmailHtml(substituteTemplateVars(t.body_html, vars)))
      await db.from("candidate_history").insert({
        candidate_id: a.candidate_id,
        type: "automation",
        content: `„${t.name}“ an ${vars.Kundenname || "die Kanzlei"} verschickt (${recipients.join(", ")})`,
        created_by: byUserId ?? null,
      })
    }
  } catch (err) {
    console.error("Mail an Kanzlei bei Zuordnung fehlgeschlagen:", assignmentId, err instanceof Error ? err.message : err)
  }
}
