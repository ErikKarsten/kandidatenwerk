"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"

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

// Reduzierte, kundenfreundliche Auswahl statt der vollen internen 6-Werte-Pipeline
// (inbox/vq/vqk/vg/ja/nein, siehe ASSIGNMENT_STATUS_OPTIONS in matches-section.tsx) -
// die drei internen Vorstufen bleiben nur für Staff änderbar (Anfrage vom 28.09.2026).
// Gleiche Werte wie in der neuen RLS-Policy "Kunde aendert Status der eigenen aktiven
// Zuordnung" (20260928000000) - zusätzliche Prüfung hier ist bewusst redundant
// (Defense in Depth), nicht die einzige Absicherung.
const PORTAL_ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  vg: "Interview vereinbart",
  ja: "Angenommen",
  nein: "Abgelehnt",
}

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
  if (!(newStatus in PORTAL_ASSIGNMENT_STATUS_LABELS)) {
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

  const { error: updateError } = await supabase
    .from("client_assignments")
    .update({ status: newStatus })
    .eq("id", clientAssignmentId)

  if (updateError) return { error: updateError.message }

  const admin = createSupabaseAdminClient()
  const { error: historyError } = await admin.from("candidate_history").insert({
    candidate_id: assignment.candidate_id,
    type: "note",
    content: `Status durch Kunden im Portal geändert: "${PORTAL_ASSIGNMENT_STATUS_LABELS[newStatus]}".`,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError)

  revalidatePath(`/portal/candidates/${assignment.candidate_id}`)
  revalidatePath(`/dashboard/candidates/${assignment.candidate_id}`)
  return null
}
