"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { PORTAL_ASSIGNMENT_STATUS_VALUES, assignmentStatusLabel } from "@/lib/assignment-status"

// Nutzt bewusst createSupabaseServerClient() (nicht den Admin-Client) - der Insert
// laeuft ueber die normale Session des eingeloggten Kunden, RLS
// ("Kunde liest/schreibt eigene Notizen", 20260907000001) sorgt dafuer, dass er nur
// Notizen zu SEINEN eigenen client_assignments anlegen kann.
export async function createNoteAction(
  clientAssignmentId: string,
  content: string
): Promise<{ error: string } | null> {
  const trimmed = content.trim()
  if (!trimmed) return { error: "Notiz darf nicht leer sein." }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { error } = await supabase.from("client_assignment_notes").insert({
    client_assignment_id: clientAssignmentId,
    author_id: user.id,
    content: trimmed,
  })

  if (error) return { error: error.message }

  revalidatePath("/portal/candidates")
  return null
}

// Der Kunde setzt nur Vorstellungsgespräch/Eingestellt/Abgelehnt (src/lib/assignment-status.ts).
// Gleiche Werte wie in der RLS-Policy "Kunde aendert Status der eigenen aktiven
// Zuordnung" (20260928000000) - zusätzliche Prüfung hier bewusst redundant.

// Nutzt bewusst createSupabaseServerClient() für den Status-Update selbst (nicht den
// Admin-Client) - RLS ("Kunde aendert Status der eigenen aktiven Zuordnung",
// 20260928000000) sorgt dafuer, dass ein Kunde nur seine EIGENE aktive Zuordnung und
// nur auf einen der drei oben genannten Werte setzen kann; ein begleitender
// Datenbank-Trigger verhindert zusätzlich, dass dabei andere Spalten als "status"
// mitgeändert werden. Der anschließende candidate_history-Eintrag läuft bewusst über
// den Admin-Client, da Portal-Kunden auf diese Tabelle (der interne Verlauf) laut
// Spezifikation keinen eigenen Zugriff haben - candidate_id/Inhalt werden hier
// vollständig serverseitig bestimmt, nichts davon kommt ungeprüft vom Client.
export async function updatePortalAssignmentStatusAction(
  clientAssignmentId: string,
  newStatus: string
): Promise<{ error: string } | null> {
  if (!PORTAL_ASSIGNMENT_STATUS_VALUES.includes(newStatus)) {
    return { error: "Ungültiger Status." }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: assignment, error: fetchError } = await supabase
    .from("client_assignments")
    .select("id, candidate_id, status")
    .eq("id", clientAssignmentId)
    .is("removed_at", null)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }
  if (!assignment) return { error: "Zuordnung nicht gefunden." }
  if (assignment.status === newStatus) return null

  const { data: updated, error: updateError } = await supabase
    .from("client_assignments")
    .update({ status: newStatus })
    .eq("id", clientAssignmentId)
    .select("id")

  if (updateError) return { error: updateError.message }
  // RLS lehnt still ab (0 Zeilen) - dann auch keinen Verlaufseintrag schreiben.
  if (!updated?.length) return { error: "Status konnte nicht geändert werden." }

  const admin = createSupabaseAdminClient()
  const { error: historyError } = await admin.from("candidate_history").insert({
    candidate_id: assignment.candidate_id,
    type: "note",
    content: `Status durch Kunden im Portal geändert: "${assignmentStatusLabel(newStatus).label}".`,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError)

  revalidatePath(`/portal/candidates/${assignment.candidate_id}`)
  revalidatePath(`/dashboard/candidates/${assignment.candidate_id}`)
  return null
}

// Kanzlei beendet eine Zuordnung selbst (Paket 28, T-109): Der Kandidat bleibt bei der
// Agentur erhalten, nur die Zuordnung wird per removed_at beendet - wie beim Entfernen im
// Backend. Die Zuordnung wird zuerst über die Session gelesen (RLS: nur eigene, aktive
// Zuordnungen sichtbar); erst danach setzt der Admin-Client removed_at, weil die
// Portal-Policy nur Statuswechsel erlaubt. Ein Verlaufseintrag hält fest, wer es war.
export async function removePortalAssignmentAction(clientAssignmentId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: assignment, error: fetchError } = await supabase
    .from("client_assignments")
    .select("id, candidate_id, client_id, campaign_id")
    .eq("id", clientAssignmentId)
    .is("removed_at", null)
    .maybeSingle()
  if (fetchError) return { error: fetchError.message }
  if (!assignment) return { error: "Zuordnung nicht gefunden." }

  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin.from("profiles").select("role, client_id, full_name, email").eq("id", user.id).maybeSingle()
  if (profile?.role !== "client" || profile.client_id !== assignment.client_id) return { error: "Keine Berechtigung." }

  const { error: updateError } = await admin
    .from("client_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", assignment.id)
    .is("removed_at", null)
  if (updateError) return { error: updateError.message }

  const { data: client } = await admin.from("clients").select("name").eq("id", assignment.client_id).maybeSingle()
  const { error: historyError } = await admin.from("candidate_history").insert({
    candidate_id: assignment.candidate_id,
    type: "note",
    content: `Zuordnung zu „${client?.name ?? "Kanzlei"}“ durch die Kanzlei im Portal entfernt (${profile.full_name || profile.email || "Portal-Zugang"}).`,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError)

  revalidatePath("/portal", "layout")
  revalidatePath(`/dashboard/candidates/${assignment.candidate_id}`)
  return null
}
