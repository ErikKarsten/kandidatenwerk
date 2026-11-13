"use client"

import { useState } from "react"
import Link from "@/components/app-link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  UserSearch,
  MapPin,
  ListTodo,
  Settings,
  Briefcase,
  PanelLeftClose,
  PanelLeftOpen,
  Bug,
  LayoutGrid,
  BookOpen,
  Handshake,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLocalStorageValue } from "@/lib/use-local-storage"
import { useIsMobile } from "@/lib/use-is-mobile"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { BugReportButton } from "@/components/bug-report-button"
import { ShowModeSidebarToggle } from "@/components/layout/show-mode-sidebar-toggle"
import { CommandPalette, type PaletteTarget } from "@/components/layout/command-palette"

// Seitenleiste im Look der Sidebar-Vorlage (Paket 105, src/components/ui/dashboard-sidebar.tsx):
// hell, Zwischenüberschriften, Schnellsuche mit ⌘K - mit der echten Kandidatenwerk-Navigation.
const SIDEBAR_COLLAPSED_KEY = "sidebar_collapsed"
const BRAND = "#1e56a0"
const BORDER = "#dde3ea"

interface NavEntry {
  href: string
  label: string
  icon: React.ElementType
  badge?: number
  // Eigene Seite außerhalb des Dashboards (Handbuch, Paket 91): normaler Link in neuem Tab.
  external?: boolean
}

function buildNavGroups(counts: { candidates: number; clients: number; tasks: number; matching: number }): { heading?: string; items: NavEntry[] }[] {
  return [
    {
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/dashboard/tasks", label: "Aufgaben", icon: ListTodo, badge: counts.tasks },
      ],
    },
    {
      heading: "Kandidaten",
      items: [
        { href: "/dashboard/candidates", label: "Alle Kandidaten", icon: UserSearch, badge: counts.candidates },
        { href: "/dashboard/leads", label: "Nach Kampagnen", icon: LayoutGrid },
        { href: "/dashboard/matching", label: "Matching", icon: Handshake, badge: counts.matching },
        { href: "/dashboard/map", label: "Karte", icon: MapPin },
      ],
    },
    {
      heading: "Kunden",
      items: [{ href: "/dashboard/clients", label: "Kunden", icon: Users, badge: counts.clients }],
    },
  ]
}

const SETTINGS_HREF = "/dashboard/einstellungen"
const BUG_REPORTS_HREF = "/dashboard/fehlermeldungen"

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname.startsWith(href + "/")
}

function initials(name: string): string {
  const parts = name.split(/[\s@.]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?"
}

// Im eingeklappten Zustand ersetzt ein Tooltip das ausgeblendete Label.
function WithTooltip({ collapsed, label, children }: { collapsed: boolean; label: string; children: React.ReactElement }) {
  if (!collapsed) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

const itemClass = (active: boolean, collapsed: boolean) =>
  cn(
    "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] tracking-wide transition-colors select-none",
    collapsed && "justify-center px-0",
    active ? "font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
  )

function NavItem({ href, label, icon: Icon, badge, active, collapsed, external = false }: NavEntry & { active: boolean; collapsed: boolean }) {
  const Anchor = external ? "a" : Link
  return (
    <WithTooltip collapsed={collapsed} label={label}>
      <Anchor
        href={href}
        {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        aria-current={active ? "page" : undefined}
        className={itemClass(active, collapsed)}
        style={active ? { backgroundColor: `${BRAND}14`, color: BRAND } : undefined}
      >
        <Icon className={cn("h-4 w-4 shrink-0", !active && "text-gray-400 group-hover:text-gray-600")} strokeWidth={1.75} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge !== undefined && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{ backgroundColor: active ? `${BRAND}1f` : "#eef2f7", color: active ? BRAND : "#4b5563" }}
              >
                {badge}
              </span>
            )}
          </>
        )}
      </Anchor>
    </WithTooltip>
  )
}

export function Sidebar({
  candidatesCount = 0,
  clientsCount = 0,
  myOpenTasksCount = 0,
  matchingCount = 0,
  userName,
  isAdmin,
  openBugReportsCount = 0,
  logoUrl = null,
}: {
  candidatesCount?: number
  clientsCount?: number
  myOpenTasksCount?: number
  // Offene Matching-Vorschläge (Paket 96).
  matchingCount?: number
  userName: string
  isAdmin: boolean
  openBugReportsCount?: number
  // Logo aus Einstellungen > Mein Konto (Paket 36); ohne Logo das Koffer-Symbol.
  logoUrl?: string | null
}) {
  const pathname = usePathname()
  const groups = buildNavGroups({ candidates: candidatesCount, clients: clientsCount, tasks: myOpenTasksCount, matching: matchingCount })
  const [searchOpen, setSearchOpen] = useState(false)

  // Start bewusst ausgeklappt (= Server-/Erstrender-Zustand), der localStorage-Wert wird
  // erst nach dem Mount übernommen - sonst Hydration-Mismatch.
  const [storedCollapsed, setCollapsed] = useLocalStorageValue(SIDEBAR_COLLAPSED_KEY, (raw) => raw === "true", false)
  // In der mobilen Schublade immer ausgeklappt (Paket 14, T-63).
  const isMobile = useIsMobile()
  const collapsed = storedCollapsed && !isMobile

  const paletteTargets: PaletteTarget[] = [
    ...groups.flatMap((g) => g.items),
    ...(isAdmin ? [{ href: BUG_REPORTS_HREF, label: "Fehlermeldungen", icon: Bug }] : []),
    { href: SETTINGS_HREF, label: "Einstellungen", icon: Settings },
  ]

  return (
    <aside
      className={cn("flex h-full shrink-0 flex-col border-r bg-white p-3 transition-[width] duration-200", collapsed ? "w-16 px-2" : "w-[248px]")}
      style={{ borderColor: BORDER }}
    >
      {/* Kopf: Logo, Name, Benutzer - an der Stelle des Arbeitsbereich-Wechslers der Vorlage. */}
      <div className={cn("mb-3 flex items-center gap-3 px-1.5 py-1.5", collapsed && "flex-col gap-2 px-0")}>
        {logoUrl ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white" style={{ borderColor: BORDER }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain p-0.5" />
          </div>
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md shadow-sm" style={{ backgroundColor: BRAND }}>
            <Briefcase size={15} className="text-white" />
          </div>
        )}
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="mb-1 truncate text-[13px] font-semibold leading-none text-gray-900">Kandidatenwerk</span>
            <span className="truncate text-[11px] leading-none text-gray-500">{isAdmin ? "Admin" : "Mitarbeiter"}</span>
          </div>
        )}
        <WithTooltip collapsed={collapsed} label={collapsed ? "Ausklappen" : "Einklappen"}>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
            className="hidden shrink-0 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 md:block"
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={1.75} /> : <PanelLeftClose size={16} strokeWidth={1.75} />}
          </button>
        </WithTooltip>
      </div>

      <WithTooltip collapsed={collapsed} label="Suchen (⌘K)">
        <button type="button" onClick={() => setSearchOpen(true)} className={itemClass(false, collapsed)}>
          <Search className="h-4 w-4 shrink-0 text-gray-400 group-hover:text-gray-600" strokeWidth={1.75} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Suchen</span>
              <kbd className="inline-flex h-5 items-center rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-gray-400" style={{ borderColor: BORDER }}>
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </WithTooltip>

      <nav className="mt-2 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group, i) => (
          <div key={group.heading ?? i} className="flex flex-col gap-0.5">
            {group.heading &&
              (collapsed ? (
                <div className="mx-2 mb-1 h-px" style={{ backgroundColor: BORDER }} />
              ) : (
                <span className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{group.heading}</span>
              ))}
            {group.items.map((item) => (
              <NavItem key={item.href} {...item} collapsed={collapsed} active={isActive(pathname, item.href)} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-3 flex flex-col gap-0.5 border-t pt-3" style={{ borderColor: BORDER }}>
        <ShowModeSidebarToggle collapsed={collapsed} />
        <BugReportButton collapsed={collapsed} tone="light" />
        {isAdmin && (
          <NavItem
            href={BUG_REPORTS_HREF}
            label="Fehlermeldungen"
            icon={Bug}
            badge={openBugReportsCount > 0 ? openBugReportsCount : undefined}
            collapsed={collapsed}
            active={isActive(pathname, BUG_REPORTS_HREF)}
          />
        )}
        <NavItem href="/handbuch" label="Handbuch" icon={BookOpen} collapsed={collapsed} active={false} external />
        <NavItem href={SETTINGS_HREF} label="Einstellungen" icon={Settings} collapsed={collapsed} active={pathname === SETTINGS_HREF} />
      </div>

      <div className={cn("mt-3 flex items-center gap-2.5 border-t px-1.5 pt-3", collapsed && "justify-center px-0")} style={{ borderColor: BORDER }}>
        <WithTooltip collapsed={collapsed} label={userName}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold" style={{ backgroundColor: `${BRAND}14`, color: BRAND }}>
            {initials(userName)}
          </div>
        </WithTooltip>
        {!collapsed && <p className="min-w-0 truncate text-[13px] font-medium text-gray-700">{userName}</p>}
      </div>

      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} targets={paletteTargets} />
    </aside>
  )
}
