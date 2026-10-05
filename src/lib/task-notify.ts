// Mail an die zugewiesene Person, sobald ihr eine Aufgabe zugewiesen wird.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { sendEmail } from "@/lib/brevo-mail"

// Neu zugewiesene Person sofort per Mail informieren (Paket 14, T-69) - nicht erst am
// Fälligkeitstag über die Erinnerung.
export async function notifyTaskAssigned(supabase: SupabaseClient<Database>, taskId: string, byUserId: string) {
  try {
    const { data: task } = await supabase
      .from("tasks")
      .select("title, description, due_date, assigned_to, candidate_id, client_id")
      .eq("id", taskId)
      .single()
    if (!task) return
    const [{ data: assignee }, { data: by }] = await Promise.all([
      supabase.from("profiles").select("email").eq("id", task.assigned_to).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", byUserId).maybeSingle(),
    ])
    if (!assignee?.email) return
    const base = "https://kandidatenwerk.kanzleistelle24.de"
    const link = task.client_id
      ? `${base}/dashboard/clients/${task.client_id}?tab=aufgaben`
      : task.candidate_id
        ? `${base}/dashboard/candidates/${task.candidate_id}`
        : `${base}/dashboard/tasks`
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    await sendEmail(
      [assignee.email],
      `Neue Aufgabe: ${task.title}`,
      `<p>${esc(by?.full_name ?? "Jemand")} hat dir eine Aufgabe zugewiesen:</p>
<p><strong>${esc(task.title)}</strong>${task.due_date ? `<br>Fällig am ${new Date(`${task.due_date}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })}` : ""}</p>
${task.description ? `<p>${esc(task.description)}</p>` : ""}
<p><a href="${link}">Aufgabe öffnen</a></p>`
    )
  } catch (err) {
    console.error("Benachrichtigung zur Aufgabe fehlgeschlagen:", err)
  }
}
