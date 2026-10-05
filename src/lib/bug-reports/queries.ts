import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import type { BugReportStatus } from "@/lib/bug-reports/shared"

// Lesezugriffe für die Admin-Übersicht /dashboard/fehlermeldungen. Nur aus Server
// Components aufrufen, NACHDEM requireAgencyAdmin() die Rolle geprüft hat - bug_reports
// hat keine RLS-Policy für Logins, gelesen wird per Service-Role, gefiltert auf die
// Agentur des Admins.

export interface BugReportListItem {
  id: string
  title: string
  description: string
  status: BugReportStatus
  reporterRole: string
  reporterName: string
  clientName: string | null
  pageUrl: string | null
  userAgent: string | null
  createdAt: string
  reviewNote: string | null
  reviewedAt: string | null
  reviewerName: string | null
  task: { id: string; title: string; status: string; assigneeName: string | null } | null
  // System-Einträge (fehlgeschlagene Cronjobs, Paket 14): zusammengefasst mit Zähler.
  source: string
  occurrences: number
  lastSeenAt: string | null
}

function db(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient
}

interface RawReport {
  id: string
  title: string
  description: string
  status: BugReportStatus
  reporter_id: string | null
  reporter_role: string
  client_id: string | null
  page_url: string | null
  user_agent: string | null
  created_at: string
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  task_id: string | null
  source: string | null
  occurrences: number | null
  last_seen_at: string | null
}

const REPORT_COLUMNS =
  "id, title, description, status, reporter_id, reporter_role, client_id, page_url, user_agent, created_at, review_note, reviewed_by, reviewed_at, task_id, source, occurrences, last_seen_at"

async function enrich(client: SupabaseClient, rows: RawReport[]): Promise<BugReportListItem[]> {
  const profileIds = [...new Set(rows.flatMap((r) => [r.reporter_id, r.reviewed_by]).filter(Boolean))] as string[]
  const clientIds = [...new Set(rows.map((r) => r.client_id).filter(Boolean))] as string[]
  const taskIds = [...new Set(rows.map((r) => r.task_id).filter(Boolean))] as string[]

  const [{ data: profiles }, { data: clients }, { data: tasks }] = await Promise.all([
    profileIds.length ? client.from("profiles").select("id, full_name, email").in("id", profileIds) : Promise.resolve({ data: [] }),
    clientIds.length ? client.from("clients").select("id, name").in("id", clientIds) : Promise.resolve({ data: [] }),
    taskIds.length
      ? client.from("tasks").select("id, title, status, assigned_to").in("id", taskIds)
      : Promise.resolve({ data: [] }),
  ])

  const assigneeIds = [...new Set((tasks ?? []).map((t) => t.assigned_to as string))].filter((id) => !profileIds.includes(id))
  const { data: assignees } = assigneeIds.length
    ? await client.from("profiles").select("id, full_name, email").in("id", assigneeIds)
    : { data: [] }

  const nameById = new Map<string, string>()
  for (const p of [...(profiles ?? []), ...(assignees ?? [])]) {
    nameById.set(p.id as string, (p.full_name as string | null) || (p.email as string | null) || "Unbekannt")
  }
  const clientNameById = new Map((clients ?? []).map((c) => [c.id as string, c.name as string]))
  const taskById = new Map((tasks ?? []).map((t) => [t.id as string, t]))

  return rows.map((r) => {
    const task = r.task_id ? taskById.get(r.task_id) : undefined
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      reporterRole: r.reporter_role,
      reporterName: r.source === "system" ? "System" : r.reporter_id ? nameById.get(r.reporter_id) ?? "Unbekannt" : "Gelöschter Nutzer",
      source: r.source ?? "nutzer",
      occurrences: r.occurrences ?? 1,
      lastSeenAt: r.last_seen_at,
      clientName: r.client_id ? clientNameById.get(r.client_id) ?? null : null,
      pageUrl: r.page_url,
      userAgent: r.user_agent,
      createdAt: r.created_at,
      reviewNote: r.review_note,
      reviewedAt: r.reviewed_at,
      reviewerName: r.reviewed_by ? nameById.get(r.reviewed_by) ?? null : null,
      task: task
        ? {
            id: task.id as string,
            title: task.title as string,
            status: task.status as string,
            assigneeName: nameById.get(task.assigned_to as string) ?? null,
          }
        : null,
    }
  })
}

export async function listBugReports(agencyId: string, statuses: BugReportStatus[] | null): Promise<BugReportListItem[]> {
  const client = db()
  let query = client.from("bug_reports").select(REPORT_COLUMNS).eq("agency_id", agencyId)
  if (statuses) query = query.in("status", statuses)
  const { data, error } = await query.order("created_at", { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return enrich(client, (data ?? []) as RawReport[])
}

export async function getBugReport(agencyId: string, reportId: string): Promise<BugReportListItem | null> {
  const client = db()
  const { data } = await client
    .from("bug_reports")
    .select(REPORT_COLUMNS)
    .eq("agency_id", agencyId)
    .eq("id", reportId)
    .maybeSingle()
  if (!data) return null
  const [item] = await enrich(client, [data as RawReport])
  return item
}

export async function getBugReportAssigneeSettings(
  agencyId: string
): Promise<{ assigneeId: string | null; team: { id: string; name: string; role: string }[] }> {
  const client = db()
  const [{ data: agency }, { data: team }] = await Promise.all([
    client.from("agencies").select("bug_report_assignee_id").eq("id", agencyId).maybeSingle(),
    client
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("agency_id", agencyId)
      .in("role", ["agency_admin", "agency_member"])
      .order("created_at", { ascending: true }),
  ])
  return {
    assigneeId: (agency?.bug_report_assignee_id as string | null | undefined) ?? null,
    team: (team ?? []).map((p) => ({
      id: p.id as string,
      name: (p.full_name as string | null) || (p.email as string | null) || "Unbekannt",
      role: p.role as string,
    })),
  }
}
