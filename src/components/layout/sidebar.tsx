"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Megaphone,
  UserSearch,
  GitMerge,
  Settings,
  Briefcase,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/clients", label: "Kunden", icon: Users },
  { href: "/dashboard/campaigns", label: "Kampagnen", icon: Megaphone },
  { href: "/dashboard/candidates", label: "Alle Kandidaten", icon: UserSearch, badge: "247" },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: GitMerge },
] as const

const SETTINGS_ITEM = { href: "/einstellungen", label: "Einstellungen", icon: Settings }

interface NavItemProps {
  href: string
  label: string
  icon: React.ElementType
  badge?: string
  active: boolean
}

function NavItem({ href, label, icon: Icon, badge, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "text-white"
          : "text-blue-100/70 hover:bg-white/10 hover:text-white"
      )}
      style={active ? { backgroundColor: "#1e56a0" } : undefined}
    >
      <Icon size={18} className="shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <Badge
          className="h-5 min-w-5 px-1.5 text-xs font-semibold"
          style={{ backgroundColor: "#4ba3c3", color: "white", border: "none" }}
        >
          {badge}
        </Badge>
      )}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="flex h-full w-60 shrink-0 flex-col"
      style={{ backgroundColor: "#0f2137" }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: "#4ba3c3" }}
        >
          <Briefcase size={16} className="text-white" />
        </div>
        <span className="text-base font-bold text-white tracking-wide">Kandidatenwerk</span>
      </div>

      <div className="mx-3 mb-4 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            {...item}
            active={item.href === "/dashboard" ? pathname === "/dashboard" : pathname === item.href || pathname.startsWith(item.href + "/")}
          />
        ))}
      </nav>

      <div className="mx-3 mb-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <div className="px-3 pb-3">
        <NavItem
          {...SETTINGS_ITEM}
          active={pathname === SETTINGS_ITEM.href}
        />
      </div>

      <div className="mx-3 mb-3 h-px" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} />

      <div className="flex items-center gap-3 px-4 pb-5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          SN
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">Steffen Neubert</p>
          <p className="truncate text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
            Admin
          </p>
        </div>
      </div>
    </aside>
  )
}
