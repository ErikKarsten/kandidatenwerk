"use server"

import { createSupabaseServerClient } from "@/lib/supabase-server"

export async function updateCandidateStatus(id: string, status: string): Promise<void> {
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase
    .from("candidates")
    .update({ status })
    .eq("id", id)
  if (error) throw new Error(error.message)
}
