// Mail an die zugewiesene Person, sobald ihr eine Aufgabe zugewiesen wird.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"
import { teamLabel } from "@/lib/teams"

// Neu zugewiesene Person sofort per Mail informieren (Paket 14, T-69) - nicht erst am
// Fälligkeitstag über die Erinnerung. Team-Aufgaben (Paket 44): jedes Team-Mitglied außer
// der Person, die zugewiesen hat.
export async function notifyTaskAssigned(supabase: SupabaseClient<Database>, taskId: string, byUserId: string) {
  try {
    const { data: task } = await supabase
      .from("tasks")
      .select("title, description, due_date, assigned_to, assigned_team, candidate_id, client_id")
      .eq("id", taskId)
      .single()
    if (!task) return
    const recipientsQuery = task.assigned_team
      ? supabase.from("profiles").select("email").eq("team", task.assigned_team).in("role", ["agency_admin", "agency_member"]).neq("id", byUserId)
      : supabase.from("profiles").select("email").eq("id", task.assigned_to ?? "")
    const [{ data: recipients }, { data: by }] = await Promise.all([
      recipientsQuery,
      supabase.from("profiles").select("full_name").eq("id", byUserId).maybeSingle(),
    ])
    const emails = (recipients ?? []).map((r) => r.email).filter((e): e is string => !!e)
    if (emails.length === 0) return
    const team = teamLabel(task.assigned_team)
    const base = "https://kandidatenwerk.kanzleistelle24.de"
    const link = task.client_id
      ? `${base}/dashboard/clients/${task.client_id}?tab=aufgaben`
      : task.candidate_id
        ? `${base}/dashboard/candidates/${task.candidate_id}`
        : `${base}/dashboard/tasks`
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    await sendEmail(
      emails,
      `Neue Aufgabe: ${task.title}`,
      `<p>${esc(by?.full_name ?? "Jemand")} hat ${team ? `dem Team ${esc(team)}` : "dir"} eine Aufgabe zugewiesen:</p>
<p><strong>${esc(task.title)}</strong>${task.due_date ? `<br>Fällig am ${new Date(`${task.due_date}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })}` : ""}</p>
${task.description ? `<p>${esc(task.description)}</p>` : ""}
<p><a href="${link}">Aufgabe öffnen</a></p>`
    )
  } catch (err) {
    console.error("Benachrichtigung zur Aufgabe fehlgeschlagen:", err)
  }
}
