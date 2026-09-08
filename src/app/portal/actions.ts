"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

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
