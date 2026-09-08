import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { getTeamMembers } from "./actions"
import { EinstellungenDetail } from "./einstellungen-detail"

export default async function EinstellungenPage() {
  const supabase = await createSupabaseServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: ownProfile } = await supabase
    .from("profiles")
    .select("id, full_name, role, agency_id")
    .eq("id", user.id)
    .single()

  // Portal-Nutzer (role "client") haben laut Spezifikation keinen Zugriff auf
  // interne Bereiche - middleware.ts sichert /dashboard/* bereits ab, das hier ist
  // nur das zweite Sicherheitsnetz, gleiches Prinzip wie an anderen Stellen.
  if (!ownProfile || ownProfile.role === "client") redirect("/portal")

  const { data: agency } = ownProfile.agency_id
    ? await supabase.from("agencies").select("id, name").eq("id", ownProfile.agency_id).single()
    : { data: null }

  const team = ownProfile.agency_id ? await getTeamMembers(ownProfile.agency_id) : []

  return (
    <EinstellungenDetail
      ownProfile={{
        id: ownProfile.id,
        full_name: ownProfile.full_name,
        email: user.email ?? null,
        role: ownProfile.role as "agency_admin" | "agency_member",
      }}
      agencyName={agency?.name ?? ""}
      team={team}
    />
  )
}
