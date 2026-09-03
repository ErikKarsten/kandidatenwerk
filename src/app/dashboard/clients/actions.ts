"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"

export type CreateClientState = { error: string } | null

export async function createClientAction(
  _prev: CreateClientState,
  formData: FormData
): Promise<CreateClientState> {
  const name = formData.get("name") as string

  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Nicht eingeloggt." }

  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id")
    .eq("id", user.id)
    .single()

  const { error } = await supabase.from("clients").insert({
    name,
    contact_name: null,
    contact_email: null,
    phone: null,
    agency_id: profile?.agency_id ?? null,
  })

  if (error) return { error: error.message }

  redirect("/dashboard/clients")
}
