// Kern der üblichen Arbeitsschritte (Paket 111): Status setzen, Notiz, Kanzlei zuordnen,
// Zuordnungsstatus, Aufgabe anlegen/erledigen. Genutzt von der Oberfläche (Server Actions)
// und der Claude-Schnittstelle (/api/mcp), damit beide genau gleich wirken: Verlauf,
// Automatisierungen, Benachrichtigungen. Ohne Login-Prüfung und ohne revalidatePath - das
// erledigt der jeweilige Aufrufer. `userId` ist die Person, in deren Namen gehandelt wird.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { triggerAutomationsNow } from "@/lib/automation-trigger"
import { CANDIDATE_STATUS_OPTIONS, RECALL_STATUS, RECALL_TASK_TITLE, recallDueDate } from "@/lib/candidate-status"
import { ASSIGNABLE_STATUS, clientNotLiveError, ensureClientAssignment } from "@/lib/client-assignment"
import { assignOwnCampaignLead } from "@/lib/own-campaign-leads"
import { notifyHistoryNoteReferences } from "@/lib/history-mentions"
import { ASSIGNMENT_STATUS_OPTIONS, assignmentStatusLabel } from "@/lib/assignment-status"
import { notifyTaskAssigned } from "@/lib/task-notify"
import { syncBugReportForTask } from "@/lib/bug-reports/resolve"

type Db = SupabaseClient<Database>
export type KernErgebnis = { error: string } | null

export async function setCandidateStatus(db: Db, userId: string, candidateId: string, status: string): Promise<{ error: string } | { clientId?: string }> {
  const { data: existing } = await db.from("candidates").select("status, campaign_id").eq("id", candidateId).single()

  const { error } = await db.from("candidates").update({ status }).eq("id", candidateId)
  if (error) return { error: error.message }

  if (existing) {
    await db.from("candidate_history").insert({
      candidate_id: candidateId,
      type: "status_change",
      content: `Status geändert: ${existing.status} → ${status}`,
      created_by: userId,
    })
  }

  // "Derzeit nicht auf Suche" (Paket 85): in 6 Monaten erneut anrufen. Gibt es die Aufgabe
  // schon offen, rückt nur ihr Termin nach hinten.
  if (existing && existing.status !== status && status === RECALL_STATUS) {
    const due = recallDueDate()
    const { data: open } = await db
      .from("tasks")
      .select("id")
      .eq("candidate_id", candidateId)
      .eq("title", RECALL_TASK_TITLE)
      .neq("status", "erledigt")
      .limit(1)
      .maybeSingle()
    const { error: taskError } = open
      ? await db.from("tasks").update({ due_date: due }).eq("id", open.id)
      : await db.from("tasks").insert({
          title: RECALL_TASK_TITLE,
          description: `Status am ${new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} auf „Derzeit nicht auf Suche“ gesetzt. Nachfragen, ob sich die Lage geändert hat und ein Wechsel jetzt in Frage kommt.`,
          assigned_to: userId,
          created_by: userId,
          candidate_id: candidateId,
          due_date: due,
        })
    if (taskError) console.error("Aufgabe erneut anrufen fehlgeschlagen:", taskError.message)
    else {
      await db.from("candidate_history").insert({
        candidate_id: candidateId,
        type: "note",
        content: `Aufgabe „Kandidat erneut anrufen“ zum ${new Date(`${due}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })} angelegt.`,
        created_by: userId,
      })
    }
  }

  // Lead aus der eigenen Meta-Kampagne einer Kanzlei (Paket 93): mit "vorqualifiziert" der
  // Kampagne zuordnen, die Mail an die Kanzlei kommt dann von der Automatisierung unten.
  let clientId: string | undefined
  if (existing && existing.status !== status && status === ASSIGNABLE_STATUS) {
    try {
      const own = await assignOwnCampaignLead(db, candidateId, userId)
      if (own?.kind === "assigned") clientId = own.clientId
    } catch (err) {
      console.error("Automatische Zuordnung fehlgeschlagen:", err)
    }
  }

  // Automatisierungen (Paket 22) sofort: Herkunftskampagne und zugeordnete Kanzlei-Kampagnen.
  if (existing && existing.status !== status) {
    const { data: assigned } = await db.from("client_assignments").select("campaign_id").eq("candidate_id", candidateId).is("removed_at", null)
    triggerAutomationsNow([existing.campaign_id, ...(assigned ?? []).map((a) => a.campaign_id)])
  }
  return { clientId }
}

export function isCandidateStatus(status: string): boolean {
  return CANDIDATE_STATUS_OPTIONS.some((o) => o.value === status)
}

export async function addCandidateNote(db: Db, userId: string, candidateId: string, content: string): Promise<KernErgebnis> {
  const { error } = await db.from("candidate_history").insert({ candidate_id: candidateId, type: "note", content, created_by: userId })
  if (error) return { error: error.message }
  // @Kollegen und Zuständige von #Aufgaben per Mail benachrichtigen (Paket 78).
  if (/[@#]/.test(content)) await notifyHistoryNoteReferences(db, { candidateId, authorId: userId, content })
  return null
}

export async function assignCandidateToClient(db: Db, userId: string, candidateId: string, clientId: string): Promise<KernErgebnis> {
  const notLive = await clientNotLiveError(db, clientId)
  if (notLive) return { error: notLive }
  try {
    await ensureClientAssignment(db, candidateId, clientId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
  const { data: client } = await db.from("clients").select("name").eq("id", clientId).maybeSingle()
  await db.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Zugeordnet zu Kanzlei „${client?.name ?? "Unbekannt"}“ (ohne Kampagne)`,
    created_by: userId,
  })
  return null
}

export async function setAssignmentStatus(
  db: Db,
  userId: string,
  assignmentId: string,
  status: string
): Promise<{ error: string } | { candidateId: string; clientId: string } | null> {
  if (!ASSIGNMENT_STATUS_OPTIONS.some((o) => o.value === status)) return { error: "Unbekannter Status." }
  const { data: before } = await db
    .from("client_assignments")
    .select("status, candidate_id, client_id, clients(name)")
    .eq("id", assignmentId)
    .is("removed_at", null)
    .maybeSingle()
  if (!before) return { error: "Zuordnung nicht gefunden." }
  if (before.status === status) return null

  // Nur die aktive Zuordnung darf im Status verändert werden.
  const { error } = await db.from("client_assignments").update({ status }).eq("id", assignmentId).is("removed_at", null)
  if (error) return { error: error.message }

  const rel = before.clients as { name: string } | { name: string }[] | null
  const clientName = (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? "Kanzlei"
  const { error: historyError } = await db.from("candidate_history").insert({
    candidate_id: before.candidate_id,
    type: "note",
    content: `Status bei „${clientName}“ geändert: ${assignmentStatusLabel(before.status).label} → ${assignmentStatusLabel(status).label}`,
    created_by: userId,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)
  return { candidateId: before.candidate_id, clientId: before.client_id }
}

export async function isStaffProfile(db: Db, profileId: string): Promise<boolean> {
  const { data } = await db.from("profiles").select("role").eq("id", profileId).maybeSingle()
  return !!data && ["agency_admin", "agency_member"].includes(data.role)
}

export async function createTask(
  db: Db,
  userId: string,
  input: {
    title: string
    description?: string | null
    assignee: { assigned_to: string | null; assigned_team: string | null }
    candidate_id?: string | null
    client_id?: string | null
    due_date?: string | null
  }
): Promise<{ error: string } | { id: string }> {
  if (!input.title.trim()) return { error: "Titel ist ein Pflichtfeld." }
  if (input.assignee.assigned_to && !(await isStaffProfile(db, input.assignee.assigned_to))) return { error: "Aufgaben können nur Team-Mitgliedern zugewiesen werden." }
  const { data: created, error } = await db
    .from("tasks")
    .insert({
      title: input.title.trim(),
      description: input.description || null,
      ...input.assignee,
      created_by: userId,
      candidate_id: input.candidate_id || null,
      client_id: input.client_id || null,
      due_date: input.due_date || null,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }
  if (input.assignee.assigned_to !== userId) await notifyTaskAssigned(db, created.id, userId)
  return { id: created.id }
}

// Aufgabe erledigen bzw. wieder öffnen; Fehlermeldungen ziehen mit (Paket 107: Mail an den Melder).
// db muss die Service-Rolle sein (bug_reports hat keine Policy für Logins) - die Oberfläche
// nutzt deshalb weiter updateTaskStatusAction.
export async function setTaskStatus(db: Db, userId: string, taskId: string, status: string): Promise<KernErgebnis> {
  const { error } = await db
    .from("tasks")
    .update({
      status,
      // "erledigt" setzt den Zeitstempel, Wiedereröffnen räumt ihn ab.
      completed_at: status === "erledigt" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
  if (error) return { error: error.message }
  await syncBugReportForTask(db as unknown as SupabaseClient, taskId, status, userId)
  return null
}
