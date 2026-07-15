"use server"

import { revalidatePath } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export async function updateMatchStatusAction(
  matchId: string,
  status: string
): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: match, error } = await supabase
    .from("candidate_campaign_matches")
    .update({ status })
    .eq("id", matchId)
    .select("candidate_id, campaign_id")
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/dashboard/candidates/${match.candidate_id}`)
  revalidatePath(`/dashboard/campaigns/${match.campaign_id}`)
  return null
}
