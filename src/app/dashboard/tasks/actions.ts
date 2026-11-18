"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { syncBugReportWithTaskStatus } from "@/lib/bug-reports/actions"
import { notifyTaskAssigned } from "@/lib/task-notify"
import { parseAssignee } from "@/lib/teams"
import { createTask, isStaffProfile } from "@/lib/kern"

export async function createTaskAction(
  formData: FormData
): Promise<{ error: string } | null> {
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const guardSupabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(guardSupabase)
  if (staffError) return staffError

  const title = (formData.get("title") as string)?.trim()
  const description = formData.get("description") as string
  // Person (Profil-ID) oder Team ("team:vertrieb", Paket 44).
  const assignee = parseAssignee((formData.get("assigned_to") as string) ?? "")
  const candidate_id = formData.get("candidate_id") as string
  const client_id = formData.get("client_id") as string
  const due_date = formData.get("due_date") as string

  if (!title) return { error: "Titel ist ein Pflichtfeld." }
  if (!assignee) return { error: "Bitte eine Person oder ein Team zuweisen." }

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // Kern gemeinsam mit der Claude-Schnittstelle (Paket 111).
  const created = await createTask(supabase, user.id, { title, description, assignee, candidate_id, client_id, due_date })
  if ("error" in created) return created

  revalidatePath("/dashboard/tasks")
  if (client_id) revalidatePath(`/dashboard/clients/${client_id}`)
  return null
}

export async function updateTaskStatusAction(
  taskId: string,
  status: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase
    .from("tasks")
    .update({
      status,
      // "erledigt" setzt den Zeitstempel, jeder andere Status (aktuell nur "offen" -
      // Wiedereröffnen) räumt ihn wieder ab, statt einen veralteten Wert stehen zu lassen.
      completed_at: status === "erledigt" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)

  if (error) return { error: error.message }

  // Aufgaben aus "Fehler melden": Meldung mit auf erledigt bzw. zurück auf freigegeben setzen.
  await syncBugReportWithTaskStatus(taskId, status)

  revalidatePath("/dashboard/tasks")
  return null
}

export async function deleteTaskAction(
  taskId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  // Entscheidung: nur der Ersteller darf eine Aufgabe löschen, nicht jeder Nutzer -
  // verhindert, dass z.B. die zugewiesene Person eine unangenehme Aufgabe einfach
  // verschwinden lässt, statt sie als "erledigt" zu markieren. Wer sie angelegt hat,
  // kann sie auch wieder entfernen. .select().single() macht das explizit: betrifft
  // die Löschung keine Zeile (falsche ID oder nicht der Ersteller), kommt ein klarer
  // Fehler zurück statt eines stillen No-Ops (gleiches Muster wie deleteNoteAction in
  // candidates/[id]/actions.ts).
  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("created_by", user.id)
    .select("id")
    .single()

  if (error) {
    return { error: "Aufgabe konnte nicht gelöscht werden (nicht gefunden oder keine Berechtigung)." }
  }

  revalidatePath("/dashboard/tasks")
  return null
}

// Aufgabe neu zuweisen (Paket 14, T-69) - jedes Team-Mitglied, an Personen oder (Paket 44)
// ein ganzes Team.
export async function updateTaskAssigneeAction(taskId: string, assignedTo: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }
  const assignee = parseAssignee(assignedTo)
  if (!assignee) return { error: "Bitte eine Person oder ein Team zuweisen." }
  if (assignee.assigned_to && !(await isStaffProfile(supabase, assignee.assigned_to))) return { error: "Aufgaben können nur Team-Mitgliedern zugewiesen werden." }

  const { data: task, error } = await supabase.from("tasks").update(assignee).eq("id", taskId).select("id, client_id").single()
  if (error) return { error: error.message }
  if (assignee.assigned_to !== user.id) await notifyTaskAssigned(supabase, taskId, user.id)
  revalidatePath("/dashboard/tasks")
  if (task.client_id) revalidatePath(`/dashboard/clients/${task.client_id}`)
  return null
}
