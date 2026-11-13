"use client"

import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { useShowMode } from "@/lib/show-mode"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Anonymisierter Modus als Schalter in der Seitenleiste (Paket 64) - gilt überall
// (Kandidatenliste, Kandidat, Seitenfenster, Karte), statt je Seite eigene Knöpfe.
export function ShowModeSidebarToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [on, setOn] = useShowMode()
  const label = on ? "Anonymisiert an" : "Anonymisierter Modus"

  const trigger = (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn(!on)}
      title={on ? "Anonymisierten Modus beenden" : "Personenbezogene Daten ausblenden, z. B. zum Vorführen beim Kunden"}
      // Heller Look der Sidebar (Paket 105); eingeschaltet weiter deutlich violett.
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] tracking-wide transition-colors",
        on ? "hover:bg-violet-500/90" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        collapsed && "justify-center px-0"
      )}
      style={on ? { backgroundColor: "#7c3aed", color: "#fff" } : undefined}
    >
      {on ? (
        <EyeOff className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      ) : (
        <Eye className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-gray-600" strokeWidth={1.75} />
      )}
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {/* Kleiner Schieberegler: auf einen Blick an oder aus. */}
          <span
            aria-hidden
            className="relative h-4 w-7 shrink-0 rounded-full transition-colors"
            style={{ backgroundColor: on ? "rgba(255,255,255,0.35)" : "#d1d5db" }}
          >
            <span
              className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all"
              style={{ left: on ? "0.875rem" : "0.125rem" }}
            />
          </span>
        </>
      )}
    </button>
  )

  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    trigger
  )
}
