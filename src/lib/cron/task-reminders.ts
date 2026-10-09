// Tägliche Erinnerung an fällige Aufgaben (Atlas T-12, 02.10.2026): jede Person mit
// offenen Aufgaben, die heute fällig oder überfällig sind, bekommt EINE Sammel-Mail.
// Läuft per Cloudflare Cron Trigger (custom-worker.ts -> /api/cron/task-reminders,
// täglich 06:00 UTC = 08:00 Sommerzeit / 07:00 Winterzeit).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { emailButton, renderEmailLayout } from "@/lib/email-layout"

type Supabase = SupabaseClient<Database>

const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

export interface TaskRemindersResult {
  dueTasks: number
  mailsSent: number
  skippedNoEmail: number
  errors: number
}

interface DueTask {
  id: string
  title: string
  due_date: string
  assigned_to: string | null
  assigned_team?: string | null
  candidate_id: string | null
  client_id: string | null
}

// "Heute" in deutscher Zeit als YYYY-MM-DD (due_date ist ein reines Datum).
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now)
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-")
  return `${d}.${m}.${y}`
}

export function buildReminderHtml(tasks: DueTask[], today: string): string {
  const items = tasks
    .map((t) => {
      const overdue = t.due_date < today
      const link = t.client_id
        ? `${APP_BASE_URL}/dashboard/clients/${t.client_id}?tab=aufgaben`
        : t.candidate_id
          ? `${APP_BASE_URL}/dashboard/candidates/${t.candidate_id}`
          : `${APP_BASE_URL}/dashboard/tasks`
      return `<li style="margin-bottom:8px"><a href="${link}" style="color:#1e56a0;text-decoration:none;font-weight:500">${escapeHtml(t.title)}</a><br><span style="font-size:12px;color:${overdue ? "#dc2626" : "#6b7280"}">${overdue ? "Überfällig seit" : "Fällig am"} ${formatDate(t.due_date)}</span></li>`
    })
    .join("")

  return renderEmailLayout({
    heading: tasks.length === 1 ? "1 Aufgabe ist fällig" : `${tasks.length} Aufgaben sind fällig`,
    contentHtml: `<ul style="padding-left:18px;margin:0">${items}</ul>${emailButton(`${APP_BASE_URL}/dashboard/tasks`, "Alle Aufgaben ansehen")}`,
  })
}

export async function sendTaskReminders(supabase: Supabase): Promise<TaskRemindersResult> {
  const today = berlinToday()
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, assigned_to, assigned_team, candidate_id, client_id")
    .eq("status", "offen")
    .not("due_date", "is", null)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
  if (error) throw new Error(error.message)

  const tasks = (data ?? []) as DueTask[]
  // Team-Aufgaben (Paket 44) landen in der Sammel-Mail jedes Team-Mitglieds.
  const teams = [...new Set(tasks.map((t) => t.assigned_team).filter((t): t is string => !!t))]
  const { data: teamMembers } = teams.length
    ? await supabase.from("profiles").select("id, team").in("team", teams).in("role", ["agency_admin", "agency_member"])
    : { data: [] as { id: string; team: string | null }[] }
  const byAssignee = new Map<string, DueTask[]>()
  const add = (id: string, t: DueTask) => byAssignee.set(id, [...(byAssignee.get(id) ?? []), t])
  for (const t of tasks) {
    if (t.assigned_to) add(t.assigned_to, t)
    else for (const m of teamMembers ?? []) if (m.team === t.assigned_team) add(m.id, t)
  }

  const result: TaskRemindersResult = { dueTasks: tasks.length, mailsSent: 0, skippedNoEmail: 0, errors: 0 }

  for (const [assigneeId, assigneeTasks] of byAssignee) {
    try {
      // profiles.email ist bei älteren Team-Profilen NULL - dann über die Auth-Admin-API.
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", assigneeId).maybeSingle()
      let email = profile?.email ?? null
      if (!email) {
        const { data: authUser } = await supabase.auth.admin.getUserById(assigneeId)
        email = authUser.user?.email ?? null
      }
      if (!email) {
        result.skippedNoEmail++
        continue
      }

      const subject =
        assigneeTasks.length === 1 ? `Fällige Aufgabe: ${assigneeTasks[0].title}` : `${assigneeTasks.length} fällige Aufgaben`
      await sendEmail([email], subject, buildReminderHtml(assigneeTasks, today))
      result.mailsSent++
    } catch (err) {
      console.error(`[task-reminders] Erinnerung an ${assigneeId} fehlgeschlagen:`, err)
      result.errors++
    }
  }

  return result
}
