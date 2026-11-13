"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"
import { cn } from "@/lib/utils"

// Mobile Ansicht (Paket 14, T-63): Auf schmalen Bildschirmen verschwindet die Sidebar
// hinter einem Menü-Knopf in einer Kopfleiste und öffnet sich als Schublade von links.
// Ab md (768px) bleibt alles wie bisher. Die Schublade schließt sich bei jedem
// Seitenwechsel von selbst (offen = "für diesen Pfad geöffnet").
// tone "light": helle Dashboard-Sidebar (Paket 105); "dark": Kundenportal.
export function ResponsiveShell({ sidebar, title, children, tone = "dark" }: { sidebar: React.ReactNode; title: string; children: React.ReactNode; tone?: "dark" | "light" }) {
  const light = tone === "light"
  const pathname = usePathname()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === pathname

  return (
    <div className="flex h-full flex-col md:flex-row">
      <header
        className={cn("flex shrink-0 items-center gap-3 px-4 py-3 md:hidden", light && "border-b bg-white")}
        style={light ? { borderColor: "#dde3ea" } : { backgroundColor: "#0f2137" }}
      >
        <button
          type="button"
          onClick={() => setOpenFor(open ? null : pathname)}
          aria-label={open ? "Menü schließen" : "Menü öffnen"}
          className={cn("rounded-md p-1.5", light ? "text-gray-600 hover:bg-gray-100" : "text-white hover:bg-white/10")}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
        <span className={cn("truncate text-base tracking-wide", light ? "font-semibold text-gray-900" : "font-bold text-white")}>{title}</span>
      </header>

      {open && (
        <div
          className="fixed inset-0 z-[1100] md:hidden"
          style={{ backgroundColor: "rgba(15, 33, 55, 0.45)" }}
          onClick={() => setOpenFor(null)}
          aria-hidden
        />
      )}
      {/* z-Index über Leaflet-Karten (deren Ebenen liegen bei 400-1000). Bewusst über
          "left" statt translate verschoben: ein transform/translate macht den Container
          zum Bezugsrahmen für position:fixed - der Fehlermelde-Dialog aus der Sidebar
          wäre dann auf deren Breite eingesperrt. */}
      <div
        className={cn(
          "fixed inset-y-0 z-[1200] transition-[left] duration-200 md:static md:z-auto",
          open ? "left-0" : "-left-72"
        )}
      >
        {sidebar}
      </div>

      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
