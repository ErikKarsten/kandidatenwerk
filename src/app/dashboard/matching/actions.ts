"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getStaffContext } from "@/lib/auth-guards"
import { assignCandidateToCampaignAction } from "@/app/dashboard/campaigns/[id]/actions"

// Matching-Übersicht (Paket 96): zuordnen, "Nicht vorschlagen" (gilt dauerhaft für diese
// Kampagne) und rückgängig machen. Jeweils mit Verlaufseintrag beim Kandidaten. Zuordnen und
// "Nicht vorschlagen" laden die Übersicht nicht neu, damit die Zeile mit ihrem Ergebnis stehen
// bleibt; der Reiter "Nicht vorgeschlagen" holt sich beim Öffnen den aktuellen Stand.

async function campaignLabel(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, campaignId: string): Promise<string | null> {
  const { data } = await supabase.from("campaigns").select("title, clients(name)").eq("id", campaignId).eq("kind", "kanzlei").maybeSingle()
  if (!data) return null
  const client = (Array.isArray(data.clients) ? data.clients[0] : data.clients) as { name: string } | null
  return client ? `„${data.title}“ (${client.name})` : `„${data.title}“`
}

export async function assignFromMatchingAction(campaignId: string, candidateId: string): Promise<{ error: string } | null> {
  const result = await assignCandidateToCampaignAction(campaignId, candidateId)
  if (result) return result
  // Gleich aus der Liste nehmen, damit der Zähler im Menü stimmt (sonst erst beim nächsten Abgleich).
  const supabase = await createSupabaseServerClient()
  await supabase.from("matching_suggestions").delete().eq("candidate_id", candidateId).eq("campaign_id", campaignId).is("dismissed_at", null)
  return null
}

export async function dismissMatchAction(campaignId: string, candidateId: string, reason: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const label = await campaignLabel(supabase, campaignId)
  if (!label) return { error: "Kampagne nicht gefunden." }
  const note = reason.trim().slice(0, 500)

  const { error } = await supabase.from("matching_suggestions").upsert(
    {
      candidate_id: candidateId,
      campaign_id: campaignId,
      dismissed_at: new Date().toISOString(),
      dismissed_by: guard.staff.userId,
      dismiss_reason: note || null,
    },
    { onConflict: "candidate_id,campaign_id" }
  )
  if (error) return { error: error.message }

  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Matching: der Kampagne ${label} nicht vorgeschlagen${note ? ` – ${note}` : ""}.`,
    created_by: guard.staff.userId,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  // Übersicht bewusst nicht neu laden: die Zeile bleibt mit "Rückgängig" stehen.
  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}

export async function undoDismissMatchAction(campaignId: string, candidateId: string): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard

  const { error } = await supabase
    .from("matching_suggestions")
    .update({ dismissed_at: null, dismissed_by: null, dismiss_reason: null })
    .eq("candidate_id", candidateId)
    .eq("campaign_id", campaignId)
  if (error) return { error: error.message }

  const label = (await campaignLabel(supabase, campaignId)) ?? "(unbekannt)"
  const { error: historyError } = await supabase.from("candidate_history").insert({
    candidate_id: candidateId,
    type: "note",
    content: `Matching: „Nicht vorschlagen“ für die Kampagne ${label} zurückgenommen.`,
    created_by: guard.staff.userId,
  })
  if (historyError) console.error("Verlaufseintrag fehlgeschlagen:", historyError.message)

  revalidatePath("/dashboard/matching")
  revalidatePath(`/dashboard/candidates/${candidateId}`)
  return null
}
