"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  UserSearch,
  GitCompare,
  MapPin,
  ListTodo,
  Settings,
  Briefcase,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed"

function buildNavItems(
  matchesCount: number,
  candidatesCount: number,
  clientsCount: number,
  myOpenTasksCount: number
) {
  return [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/clients", label: "Kunden", icon: Users, badge: String(clientsCount) },
    { href: "/dashboard/candidates", label: "Alle Kandidaten", icon: UserSearch, badge: String(candidatesCount) },
    { href: "/dashboard/matches", label: "Matching", icon: GitCompare, badge: String(matchesCount) },
    { href: "/dashboard/tasks", label: "Aufgaben", icon: ListTodo, badge: String(myOpenTasksCount) },
    { href: "/dashboard/map", label: "Karte", icon: MapPin },
  ] as const
}

const SETTINGS_ITEM = { href: "/einstellungen", label: "Einstellungen", icon: Settings }

interface NavItemProps {
  href: string
  label: string
  icon: React.ElementType
  badge?: string
  active: boolean
  collapsed: boolean
}

function NavItem({ href, label, icon: Icon, badge, active, collapsed }: NavItemProps) {
  const link = (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "text-white"
          : "text-blue-100/70 hover:bg-white/10 hover:text-white"
      )}
      style={active ? { backgroundColor: "#1e56a0" } : undefined}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1">{label}</span>
          {badge && (
            <Badge
              className="h-5 min-w-5 px-1.5 text-xs font-semibold"
              style={{ backgroundColor: "#4ba3c3", color: "white", border: "none" }}
            >
              {badge}
            </Badge>
          )}
        </>
      )}
    </Link>
  )

  // Im eingeklappten Zustand ersetzt ein Tooltip das ausgeblendete Label - ohne
  // Tooltip wüsste man sonst nicht mehr, wofür ein reines Icon steht.
  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function Sidebar({
  matchesCount = 0,
  candidatesCount = 0,
  clientsCount = 0,
  myOpenTasksCount = 0,
}: {
  matchesCount?: number
  candidatesCount?: number
  clientsCount?: number
  myOpenTasksCount?: number
}) {
  const pathname = usePathname()
  const navItems = buildNavItems(matchesCount, candidatesCount, clientsCount, myOpenTasksCount)

  // Start bewusst ausgeklappt (= Server-/Erstrender-Zustand), der localStorage-Wert wird
  // erst nach dem Mount übernommen - sonst Hydration-Mismatch, da localStorage auf dem
  // Server nicht existiert (gleiches Muster wie der view-Toggle in campaign-detail.tsx).
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (stored === "true") setCollapsed(true)
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col transition-[width] duration-200",
        collapsed ? "w-16" : "w-60"
      )}
      style={{ backgroundColor: "#0f2137" }}
    >
      <div className={cn("flex items-center gap-2.5 px-5 py-5", collapsed && "justify-center px-0")}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: "#4ba3c3" }}
        >
          <Briefcase size={16} className="text-white" />
        </div>
        {!collapsed && (
          <span className="text-base font-bold text-white tracking-wide">Kandidatenwerk</span>
        )}
      </div>

      <div className="mx-3 mb-2 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        className={cn(
          "mx-3 mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-blue-100/70 transition-colors hover:bg-white/10 hover:text-white",
          collapsed && "justify-center px-0"
        )}
      >
        {collapsed ? (
          <PanelLeftOpen size={16} className="shrink-0" />
        ) : (
          <>
            <PanelLeftClose size={16} className="shrink-0" />
            <span>Einklappen</span>
          </>
        )}
      </button>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            collapsed={collapsed}
            active={item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>

      <div className="mx-3 mb-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <div className="px-3 pb-3">
        <NavItem
          {...SETTINGS_ITEM}
          collapsed={collapsed}
          active={pathname === SETTINGS_ITEM.href}
        />
      </div>

      <div className="mx-3 mb-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <div className={cn("flex items-center gap-3 px-4 pb-5", collapsed && "justify-center px-0")}>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          SN
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Steffen Neubert</p>
            <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              Admin
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
