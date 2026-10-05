// Tägliche Erinnerung an fällige Aufgaben (Atlas T-12, 02.10.2026): jede Person mit
// offenen Aufgaben, die heute fällig oder überfällig sind, bekommt EINE Sammel-Mail.
// Läuft per Cloudflare Cron Trigger (custom-worker.ts -> /api/cron/task-reminders,
// täglich 06:00 UTC = 08:00 Sommerzeit / 07:00 Winterzeit).

import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"

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
  assigned_to: string
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

  return `
<div style="max-width:600px;margin:0 auto;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;font-family:-apple-system,Helvetica,Arial,sans-serif;overflow:hidden;">
  <div style="padding:28px 28px 4px;">
    <div style="font-size:20px;font-weight:700;color:#1e56a0;">Kandidatenwerk</div>
    <div style="font-size:16px;font-weight:600;color:#111827;margin-top:6px;">${tasks.length === 1 ? "1 Aufgabe ist fällig" : `${tasks.length} Aufgaben sind fällig`}</div>
  </div>
  <div style="padding:16px 28px 8px;font-size:14px;color:#111827;">
    <ul style="padding-left:18px;margin:0">${items}</ul>
    <p style="margin-top:16px"><a href="${APP_BASE_URL}/dashboard/tasks" style="color:#1e56a0;text-decoration:none;font-weight:500">Alle Aufgaben ansehen</a></p>
  </div>
  <div style="padding:20px 28px 24px;margin-top:8px;border-top:1px solid #e5e7eb;">
    <div style="font-size:11px;color:#9ca3af;">Automatisch generiert von Kandidatenwerk</div>
  </div>
</div>`.trim()
}

export async function sendTaskReminders(supabase: Supabase): Promise<TaskRemindersResult> {
  const today = berlinToday()
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, assigned_to, candidate_id, client_id")
    .eq("status", "offen")
    .not("due_date", "is", null)
    .lte("due_date", today)
    .order("due_date", { ascending: true })
  if (error) throw new Error(error.message)

  const tasks = (data ?? []) as DueTask[]
  const byAssignee = new Map<string, DueTask[]>()
  for (const t of tasks) byAssignee.set(t.assigned_to, [...(byAssignee.get(t.assigned_to) ?? []), t])

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
