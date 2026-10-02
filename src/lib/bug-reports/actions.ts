"use server"

// "Fehler melden" (Atlas T-26, 02.10.2026). Alle Zugriffe auf bug_reports laufen hier
// über den Service-Role-Client - die Tabelle hat bewusst keine RLS-Policy für
// "authenticated" (siehe 20261002000001_bug_reports.sql). Jede Action prüft deshalb
// Login/Rolle selbst, bevor sie etwas liest oder schreibt.
//
// Ablauf:
//   - Staff (agency_admin/agency_member) meldet -> Aufgabe (tasks) wird sofort angelegt.
//   - Portal-Kunde meldet -> Status "neu", Mail an die Admins; Aufgabe erst nach
//     Freigabe über approveBugReportAction.

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext, requireAgencyAdmin } from "@/lib/auth-guards"
import { checkBugReportRateLimit } from "@/lib/ratelimit"
import { sendEmail } from "@/lib/brevo-mail"
import { getAdminEmails } from "@/lib/get-admin-emails"
import {
  BUG_REPORT_DESCRIPTION_MAX,
  BUG_REPORT_TITLE_MAX,
  type SubmitBugReportResult,
} from "@/lib/bug-reports/shared"

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"
const STAFF_ROLES = ["agency_admin", "agency_member"]

interface BugReportRow {
  id: string
  agency_id: string | null
  reporter_id: string | null
  reporter_role: string
  client_id: string | null
  title: string
  description: string
  page_url: string | null
  status: string
  created_at: string
}

// bug_reports und agencies.bug_report_assignee_id sind (noch) nicht in
// src/types/database.ts generiert - daher ungetypter Zugriff für diese Stellen.
function untypedAdmin(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Nur interne Pfade übernehmen ("/portal/..."), keine fremden URLs.
function sanitizePagePath(pageUrl: string | undefined): string | null {
  if (!pageUrl || !pageUrl.startsWith("/") || pageUrl.startsWith("//")) return null
  return pageUrl.slice(0, 500)
}

// Zuständige Person für Aufgaben aus Fehlermeldungen: die auf
// /dashboard/fehlermeldungen eingestellte, sofern sie noch Staff dieser Agentur ist -
// sonst der erste Admin der Agentur.
async function resolveAssignee(db: SupabaseClient, agencyId: string): Promise<string | null> {
  const { data: agency } = await db
    .from("agencies")
    .select("bug_report_assignee_id")
    .eq("id", agencyId)
    .maybeSingle()

  const configured = agency?.bug_report_assignee_id as string | null | undefined
  if (configured) {
    const { data: profile } = await db
      .from("profiles")
      .select("id, role, agency_id")
      .eq("id", configured)
      .maybeSingle()
    if (profile && STAFF_ROLES.includes(profile.role) && profile.agency_id === agencyId) return configured
  }

  const { data: firstAdmin } = await db
    .from("profiles")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("role", "agency_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return (firstAdmin?.id as string | undefined) ?? null
}

async function createTaskForReport(
  db: SupabaseClient,
  report: BugReportRow,
  createdBy: string
): Promise<{ error: string } | { taskId: string }> {
  if (!report.agency_id) return { error: "Meldung ist keiner Agentur zugeordnet." }
  const assignee = await resolveAssignee(db, report.agency_id)
  if (!assignee) return { error: "Kein Admin gefunden, dem die Aufgabe zugewiesen werden kann." }

  const [{ data: reporter }, { data: client }] = await Promise.all([
    report.reporter_id
      ? db.from("profiles").select("full_name, email").eq("id", report.reporter_id).maybeSingle()
      : Promise.resolve({ data: null }),
    report.client_id
      ? db.from("clients").select("name").eq("id", report.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const reporterLabel = reporter?.full_name || reporter?.email || "Unbekannt"
  const origin = client?.name ? `Kunden-Portal, ${client.name}` : "Team"
  const reportedAt = new Date(report.created_at).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })

  const description = [
    report.description,
    "",
    `Gemeldet von ${reporterLabel} (${origin}) am ${reportedAt}${report.page_url ? ` auf ${report.page_url}` : ""}.`,
    `Fehlermeldung: ${APP_BASE_URL}/dashboard/fehlermeldungen/${report.id}`,
  ].join("\n")

  const { data: task, error } = await db
    .from("tasks")
    .insert({
      title: `Fehler: ${report.title}`,
      description,
      assigned_to: assignee,
      created_by: createdBy,
    })
    .select("id")
    .single()

  if (error || !task) return { error: error?.message ?? "Aufgabe konnte nicht angelegt werden." }
  return { taskId: task.id as string }
}

export async function submitBugReportAction(input: {
  title: string
  description: string
  pageUrl?: string
}): Promise<SubmitBugReportResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  if (!(await checkBugReportRateLimit(user.id))) {
    return { error: "Zu viele Meldungen in kurzer Zeit. Bitte warte eine Minute." }
  }

  const title = (input.title ?? "").trim()
  const description = (input.description ?? "").trim()
  if (!title) return { error: "Bitte einen kurzen Titel angeben." }
  if (!description) return { error: "Bitte beschreiben, was passiert ist." }
  if (title.length > BUG_REPORT_TITLE_MAX) return { error: `Titel höchstens ${BUG_REPORT_TITLE_MAX} Zeichen.` }
  if (description.length > BUG_REPORT_DESCRIPTION_MAX) {
    return { error: `Beschreibung höchstens ${BUG_REPORT_DESCRIPTION_MAX} Zeichen.` }
  }

  // Eigenes Profil über die RLS-Session - jeder Login darf sein eigenes Profil lesen.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, agency_id, client_id")
    .eq("id", user.id)
    .single()
  if (!profile) return { error: "Profil nicht gefunden." }

  const db = untypedAdmin()
  const isStaff = STAFF_ROLES.includes(profile.role)
  let agencyId: string | null = profile.agency_id

  if (!isStaff) {
    if (profile.role !== "client" || !profile.client_id) return { error: "Nicht berechtigt." }
    // Portal-Kunden haben agency_id = NULL (Sicherheitsvorfall 22.09.2026) - die Agentur
    // kommt serverseitig vom zugeordneten Kunden, nicht vom Client.
    const { data: client } = await db.from("clients").select("agency_id").eq("id", profile.client_id).maybeSingle()
    agencyId = (client?.agency_id as string | null | undefined) ?? null
  }
  if (!agencyId) return { error: "Agentur konnte nicht ermittelt werden." }

  const { data: inserted, error: insertError } = await db
    .from("bug_reports")
    .insert({
      agency_id: agencyId,
      reporter_id: user.id,
      reporter_role: profile.role,
      client_id: isStaff ? null : profile.client_id,
      title,
      description,
      page_url: sanitizePagePath(input.pageUrl),
      user_agent: ((await headers()).get("user-agent") ?? "").slice(0, 500) || null,
    })
    .select("id, agency_id, reporter_id, reporter_role, client_id, title, description, page_url, status, created_at")
    .single()
  if (insertError || !inserted) return { error: insertError?.message ?? "Meldung konnte nicht gespeichert werden." }
  const report = inserted as BugReportRow

  if (isStaff) {
    const result = await createTaskForReport(db, report, user.id)
    if ("error" in result) {
      // Meldung bleibt als "neu" stehen und taucht in der Admin-Übersicht auf.
      console.error(`[bug-reports] Aufgabe für Meldung ${report.id} nicht angelegt: ${result.error}`)
      return { ok: true, outcome: "pending_review" }
    }
    await db
      .from("bug_reports")
      .update({
        status: "freigegeben",
        task_id: result.taskId,
        reviewed_at: new Date().toISOString(),
        review_note: "Vom Team gemeldet - Aufgabe direkt angelegt.",
      })
      .eq("id", report.id)
    revalidatePath("/dashboard/tasks")
    revalidatePath("/dashboard/fehlermeldungen")
    return { ok: true, outcome: "task_created" }
  }

  // Portal-Kunde: Admins zur Prüfung benachrichtigen. Ein Mailfehler darf die Meldung
  // selbst nicht scheitern lassen - sie steht ohnehin in der Admin-Übersicht.
  try {
    await notifyAdminsAboutClientReport(report)
  } catch (err) {
    console.error(`[bug-reports] Admin-Mail für Meldung ${report.id} fehlgeschlagen:`, err)
  }
  revalidatePath("/dashboard/fehlermeldungen")
  return { ok: true, outcome: "pending_review" }
}

async function notifyAdminsAboutClientReport(report: BugReportRow): Promise<void> {
  const admin = createSupabaseAdminClient()
  const recipients = await getAdminEmails(admin)
  if (recipients.length === 0) return

  const db = admin as unknown as SupabaseClient
  const [{ data: client }, { data: reporter }] = await Promise.all([
    report.client_id ? db.from("clients").select("name").eq("id", report.client_id).maybeSingle() : Promise.resolve({ data: null }),
    report.reporter_id ? db.from("profiles").select("email").eq("id", report.reporter_id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const link = `${APP_BASE_URL}/dashboard/fehlermeldungen/${report.id}`
  await sendEmail(
    recipients,
    `Fehlermeldung aus dem Kunden-Portal: ${report.title}`,
    `<p>Ein Kunde hat im Portal einen Fehler gemeldet. Bitte prüfen und freigeben oder ablehnen - erst nach der Freigabe wird eine Aufgabe angelegt.</p>
<table style="font-size:14px;border-collapse:collapse">
<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Kunde</td><td>${escapeHtml(client?.name ?? "-")}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Gemeldet von</td><td>${escapeHtml(reporter?.email ?? "-")}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Seite</td><td>${escapeHtml(report.page_url ?? "-")}</td></tr>
<tr><td style="padding:2px 12px 2px 0;color:#6b7280">Titel</td><td><strong>${escapeHtml(report.title)}</strong></td></tr>
</table>
<p style="white-space:pre-wrap;background:#f3f4f6;padding:10px;font-size:14px">${escapeHtml(report.description)}</p>
<p><a href="${link}">Meldung prüfen</a></p>`
  )
}

// --- Admin-Aktionen (/dashboard/fehlermeldungen) ---

async function loadReportForAdmin(
  db: SupabaseClient,
  reportId: string,
  agencyId: string | null
): Promise<BugReportRow | null> {
  if (!agencyId) return null
  const { data } = await db
    .from("bug_reports")
    .select("id, agency_id, reporter_id, reporter_role, client_id, title, description, page_url, status, created_at")
    .eq("id", reportId)
    .eq("agency_id", agencyId)
    .maybeSingle()
  return (data as BugReportRow | null) ?? null
}

function revalidateReport(reportId: string) {
  revalidatePath("/dashboard/fehlermeldungen")
  revalidatePath(`/dashboard/fehlermeldungen/${reportId}`)
}

export async function approveBugReportAction(reportId: string, note: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard

  const db = untypedAdmin()
  const report = await loadReportForAdmin(db, reportId, guard.staff.agencyId)
  if (!report) return { error: "Meldung nicht gefunden." }
  if (report.status !== "neu" && report.status !== "in_pruefung") {
    return { error: "Diese Meldung wurde bereits bearbeitet." }
  }

  const result = await createTaskForReport(db, report, guard.staff.userId)
  if ("error" in result) return result

  const { error } = await db
    .from("bug_reports")
    .update({
      status: "freigegeben",
      task_id: result.taskId,
      reviewed_by: guard.staff.userId,
      reviewed_at: new Date().toISOString(),
      review_note: note.trim() || null,
    })
    .eq("id", reportId)
  if (error) return { error: error.message }

  revalidateReport(reportId)
  revalidatePath("/dashboard/tasks")
  return null
}

export async function rejectBugReportAction(reportId: string, note: string): Promise<{ error: string } | null> {
  const reason = note.trim()
  if (!reason) return { error: "Bitte eine Begründung angeben." }

  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard

  const db = untypedAdmin()
  const report = await loadReportForAdmin(db, reportId, guard.staff.agencyId)
  if (!report) return { error: "Meldung nicht gefunden." }
  if (report.status !== "neu" && report.status !== "in_pruefung") {
    return { error: "Diese Meldung wurde bereits bearbeitet." }
  }

  const { error } = await db
    .from("bug_reports")
    .update({
      status: "abgelehnt",
      reviewed_by: guard.staff.userId,
      reviewed_at: new Date().toISOString(),
      review_note: reason,
    })
    .eq("id", reportId)
  if (error) return { error: error.message }

  revalidateReport(reportId)
  return null
}

// "In Prüfung" (Admin hat die Meldung angesehen) und "Erledigt" (ohne Aufgabe gelöst
// oder Aufgabe erledigt). Andere Übergänge laufen über Freigeben/Ablehnen.
export async function setBugReportStatusAction(
  reportId: string,
  status: "in_pruefung" | "erledigt"
): Promise<{ error: string } | null> {
  if (status !== "in_pruefung" && status !== "erledigt") return { error: "Ungültiger Status." }

  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard

  const db = untypedAdmin()
  const report = await loadReportForAdmin(db, reportId, guard.staff.agencyId)
  if (!report) return { error: "Meldung nicht gefunden." }

  const { error } = await db.from("bug_reports").update({ status }).eq("id", reportId)
  if (error) return { error: error.message }

  revalidateReport(reportId)
  return null
}

export async function updateBugReportAssigneeAction(profileId: string | null): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard) return guard
  if (!guard.staff.agencyId) return { error: "Eigene Agentur konnte nicht ermittelt werden." }

  const db = untypedAdmin()
  if (profileId) {
    const { data: target } = await db.from("profiles").select("role, agency_id").eq("id", profileId).maybeSingle()
    if (!target || !STAFF_ROLES.includes(target.role) || target.agency_id !== guard.staff.agencyId) {
      return { error: "Team-Mitglied nicht gefunden." }
    }
  }

  const { error } = await db
    .from("agencies")
    .update({ bug_report_assignee_id: profileId })
    .eq("id", guard.staff.agencyId)
  if (error) return { error: error.message }

  revalidatePath("/dashboard/fehlermeldungen")
  return null
}

// Hält den Status einer freigegebenen Meldung mit ihrer Aufgabe synchron - aufgerufen
// von updateTaskStatusAction (tasks/actions.ts). Fehler hier dürfen den Statuswechsel
// der Aufgabe nicht scheitern lassen.
export async function syncBugReportWithTaskStatus(taskId: string, taskStatus: string): Promise<void> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return
  try {
    const db = untypedAdmin()
    if (taskStatus === "erledigt") {
      await db.from("bug_reports").update({ status: "erledigt" }).eq("task_id", taskId).eq("status", "freigegeben")
    } else {
      await db.from("bug_reports").update({ status: "freigegeben" }).eq("task_id", taskId).eq("status", "erledigt")
    }
    revalidatePath("/dashboard/fehlermeldungen")
  } catch (err) {
    console.error(`[bug-reports] Status-Abgleich für Aufgabe ${taskId} fehlgeschlagen:`, err)
  }
}
