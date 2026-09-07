import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { PortalSidebar } from "./portal-sidebar"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // middleware.ts sichert das schon ab (Redirect bei fehlendem Login), das hier ist
  // nur das zweite Sicherheitsnetz, falls das Layout doch mal ohne Middleware
  // gerendert wird - gleiches Prinzip wie an anderen Stellen im Dashboard.
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("profiles")
    .select("client_id")
    .eq("id", user.id)
    .single()

  if (!profile?.client_id) redirect("/login")

  const { data: client } = await supabase
    .from("clients")
    .select("name, logo_url")
    .eq("id", profile.client_id)
    .single()

  return (
    <div className="flex h-full">
      <PortalSidebar clientName={client?.name ?? "Kunden-Portal"} logoUrl={client?.logo_url ?? null} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
