"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireStaffUser } from "@/lib/auth-guards"
import { createDemoCandidateForClient } from "@/lib/demo-candidate"

export type CreateClientState = { error: string } | null

export async function createClientAction(
  _prev: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const name = formData.get("name") as string

  const supabase = await createSupabaseServerClient()
  // Zweite Schutzschicht neben RLS: nur Staff (Security-Review 02.10.2026).
  const staffError = await requireStaffUser(supabase)
  if (staffError) return staffError

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      name,
      contact_name: null,
      contact_email: null,
      phone: null,
      agency_id: profile?.agency_id ?? null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }
  await createDemoCandidateForClient(supabase, created.id, user.id)

  redirect("/dashboard/clients")
}
