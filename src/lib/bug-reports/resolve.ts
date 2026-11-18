// Erledigte Fehlermeldungen (Paket 107), ohne Server-Action-Hülle: genutzt von der
// Oberfläche (bug-reports/actions.ts) und der Claude-Schnittstelle (Paket 111).
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendEmail } from "@/lib/brevo-mail"
import { APP_BASE_URL } from "@/lib/app-url"

const STAFF_ROLES = ["agency_admin", "agency_member"]

interface ReportForMail {
  reporter_id: string | null
  reporter_role: string
  title: string
  description: string
  page_url: string | null
  created_at: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Hält den Status einer freigegebenen Meldung mit ihrer Aufgabe synchron. Fehler hier
// dürfen den Statuswechsel der Aufgabe nicht scheitern lassen.
export async function syncBugReportForTask(db: SupabaseClient, taskId: string, taskStatus: string, completedBy: string): Promise<void> {
  try {
    if (taskStatus === "erledigt") {
      const { data: done } = await db
        .from("bug_reports")
        .update({ status: "erledigt" })
        .eq("task_id", taskId)
        .eq("status", "freigegeben")
        .select("id")
      for (const report of (done ?? []) as { id: string }[]) {
        await notifyReporterResolved(db, report.id, completedBy)
      }
    } else {
      await db.from("bug_reports").update({ status: "freigegeben" }).eq("task_id", taskId).eq("status", "erledigt")
    }
  } catch (err) {
    console.error(`[bug-reports] Status-Abgleich für Aufgabe ${taskId} fehlgeschlagen:`, err)
  }
}

// Mail an den Melder, sobald seine Meldung erledigt ist (Paket 107). Höchstens einmal pro
// Meldung: resolved_mail_at wird vor dem Versand atomar gesetzt, sodass erneutes Abhaken
// oder zwei gleichzeitige Klicks keine zweite Mail auslösen. Keine Mail, wenn der Melder
// die Meldung selbst erledigt hat oder es keinen Melder gibt (Systemmeldungen). Fehler
// werden nur protokolliert - der Statuswechsel selbst darf daran nie scheitern.
export async function notifyReporterResolved(db: SupabaseClient, reportId: string, completedBy: string): Promise<void> {
  try {
    const { data: claimed } = await db
      .from("bug_reports")
      .update({ resolved_mail_at: new Date().toISOString() })
      .eq("id", reportId)
      .eq("status", "erledigt")
      .is("resolved_mail_at", null)
      .select("reporter_id, reporter_role, title, description, page_url, created_at")
      .maybeSingle()
    const report = claimed as ReportForMail | null
    if (!report?.reporter_id || report.reporter_id === completedBy) return

    const { data: reporter } = await db.from("profiles").select("email, full_name").eq("id", report.reporter_id).maybeSingle()
    const email = (reporter?.email as string | undefined)?.trim()
    if (!email) return

    try {
      await sendEmail([email], `Erledigt: ${report.title}`, resolvedMailHtml(report, (reporter?.full_name as string | null) ?? null))
    } catch (err) {
      // Freigeben, damit ein erneutes Abhaken die Mail noch einmal versucht.
      await db.from("bug_reports").update({ resolved_mail_at: null }).eq("id", reportId)
      throw err
    }
  } catch (err) {
    console.error(`[bug-reports] Erledigt-Mail für Meldung ${reportId} fehlgeschlagen:`, err)
  }
}

function resolvedMailHtml(
  report: Omit<ReportForMail, "reporter_id">,
  fullName: string | null
): string {
  // Kanzleien im Portal werden gesiezt, das Team duzt sich.
  const isClient = !STAFF_ROLES.includes(report.reporter_role)
  const reportedAt = new Date(report.created_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
  const greeting = fullName ? `${isClient ? "Guten Tag" : "Hallo"} ${escapeHtml(fullName)},` : isClient ? "Guten Tag," : "Hallo,"
  const intro = isClient
    ? `Ihre Meldung vom ${reportedAt} ist erledigt: Wir haben den Fehler behoben bzw. Ihren Wunsch umgesetzt. Vielen Dank für den Hinweis!`
    : `deine Meldung vom ${reportedAt} ist erledigt: Der Fehler ist behoben bzw. dein Wunsch umgesetzt. Danke für den Hinweis!`
  const pageLink = report.page_url
    ? `<p><a href="${APP_BASE_URL}${escapeHtml(report.page_url)}">${isClient ? "Direkt zur Seite, auf der Sie es gemeldet haben" : "Direkt zur Seite, auf der du es gemeldet hast"}</a></p>`
    : ""
  const outro = isClient
    ? "Sollte noch etwas nicht passen, melden Sie sich gern einfach wieder über „Fehler melden“."
    : "Falls noch etwas nicht passt, melde es einfach wieder über „Fehler melden“."
  return `<p>${greeting}</p>
<p>${intro}</p>
<p style="margin-bottom:4px"><strong>${escapeHtml(report.title)}</strong></p>
<p style="white-space:pre-wrap;background:#f3f4f6;padding:10px;font-size:14px;margin-top:0">${escapeHtml(report.description)}</p>
${pageLink}
<p>${outro}</p>`
}
