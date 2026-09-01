"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export async function createTaskAction(
  formData: FormData
): Promise<{ error: string } | null> {
  const title = (formData.get("title") as string)?.trim()
  const description = formData.get("description") as string
  const assigned_to = formData.get("assigned_to") as string
  const candidate_id = formData.get("candidate_id") as string
  const due_date = formData.get("due_date") as string

  if (!title) return { error: "Titel ist ein Pflichtfeld." }
  if (!assigned_to) return { error: "Bitte einen Nutzer zuweisen." }

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase.from("tasks").insert({
    title,
    description: description || null,
    assigned_to,
    created_by: user.id,
    candidate_id: candidate_id || null,
    due_date: due_date || null,
  })

  if (error) return { error: error.message }

  revalidatePath("/dashboard/tasks")
  return null
}

export async function updateTaskStatusAction(
  taskId: string,
  status: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

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

  revalidatePath("/dashboard/tasks")
  return null
}

export async function deleteTaskAction(
  taskId: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

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
