"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Briefcase, LayoutDashboard, Users, Megaphone, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase"

// Bewusst KEIN wiederverwendetes Sidebar-Component aus components/layout/sidebar.tsx -
// das Kunden-Portal hat laut Spezifikation eine komplett eigene, stark reduzierte
// Navigation (nur Dashboard/Meine Kandidaten/Meine Kampagnen, kein Kunden/Alle
// Kandidaten/Matching/Aufgaben/Karte) und darf niemals versehentlich interne
// Nav-Punkte erben.
export function PortalSidebar({
  clientName,
  logoUrl,
}: {
  clientName: string
  logoUrl: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  // "/portal" ist jetzt das Dashboard (neue Startseite, siehe portal/page.tsx) - die
  // Kandidatenliste ist nach /portal/candidates umgezogen, deshalb hier klar getrennt
  // statt wie vorher gemeinsam auf "/portal" zu matchen.
  const dashboardActive = pathname === "/portal"
  const candidatesActive = pathname.startsWith("/portal/candidates")
  const campaignsActive = pathname.startsWith("/portal/campaigns")

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  function navLinkClass(active: boolean) {
    return cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      active ? "text-white" : "text-blue-100/70 hover:bg-white/10 hover:text-white"
    )
  }
  function navLinkStyle(active: boolean) {
    return active ? { backgroundColor: "#1e56a0" } : undefined
  }

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col" style={{ backgroundColor: "#0f2137" }}>
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg overflow-hidden"
          style={{ backgroundColor: "#4ba3c3" }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={clientName} className="h-full w-full object-cover" />
          ) : (
            <Briefcase size={16} className="text-white" />
          )}
        </div>
        <span className="text-base font-bold text-white tracking-wide truncate">{clientName}</span>
      </div>

      <div className="mx-3 mb-2 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <Link href="/portal" className={navLinkClass(dashboardActive)} style={navLinkStyle(dashboardActive)}>
          <LayoutDashboard size={18} className="shrink-0" />
          <span>Dashboard</span>
        </Link>
        <Link href="/portal/candidates" className={navLinkClass(candidatesActive)} style={navLinkStyle(candidatesActive)}>
          <Users size={18} className="shrink-0" />
          <span>Meine Kandidaten</span>
        </Link>
        <Link href="/portal/campaigns" className={navLinkClass(campaignsActive)} style={navLinkStyle(campaignsActive)}>
          <Megaphone size={18} className="shrink-0" />
          <span>Meine Kampagnen</span>
        </Link>
      </nav>

      <div className="px-3 pb-4">
        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <LogOut size={18} className="shrink-0" />
          <span>Abmelden</span>
        </button>
      </div>
    </aside>
  )
}
