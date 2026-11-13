"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Command, Search, UserSearch, Users, X } from "lucide-react"

// Schnellsuche (Paket 105, Idee aus der Sidebar-Vorlage): ⌘K bzw. Strg+K öffnet sie überall
// im Dashboard. Springt zu Menüpunkten und sucht Kandidaten oder Kunden (Listen mit ?q=).
export interface PaletteTarget {
  href: string
  label: string
  icon: React.ElementType
}

interface Entry {
  key: string
  label: string
  hint?: string
  icon: React.ElementType
  href: string
}

export function CommandPalette({ open, onOpenChange, targets }: { open: boolean; onOpenChange: (open: boolean) => void; targets: PaletteTarget[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Tastenkürzel global; Esc schließt.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        onOpenChange(!open)
      } else if (e.key === "Escape" && open) {
        onOpenChange(false)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onOpenChange])

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim()
    const lower = q.toLowerCase()
    const pages = targets
      .filter((t) => !lower || t.label.toLowerCase().includes(lower))
      .map((t) => ({ key: t.href, label: t.label, hint: "Seite", icon: t.icon, href: t.href }))
    if (!q) return pages
    return [
      { key: "kandidaten", label: `Kandidaten suchen: „${q}“`, icon: UserSearch, href: `/dashboard/candidates?q=${encodeURIComponent(q)}` },
      { key: "kunden", label: `Kunden suchen: „${q}“`, icon: Users, href: `/dashboard/clients?q=${encodeURIComponent(q)}` },
      ...pages,
    ]
  }, [query, targets])

  if (!open) return null

  function close() {
    onOpenChange(false)
    setQuery("")
    setIndex(0)
  }

  function go(entry: Entry | undefined) {
    if (!entry) return
    close()
    router.push(entry.href)
  }

  const active = Math.min(index, Math.max(entries.length - 1, 0))

  return (
    <div className="fixed inset-0 z-[1300] flex items-start justify-center bg-slate-900/30 px-4 pt-[15vh] backdrop-blur-sm" onClick={close}>
      <div
        role="dialog"
        aria-label="Schnellsuche"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
        style={{ borderColor: "#dde3ea" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b px-4" style={{ borderColor: "#dde3ea" }}>
          <Search className="mr-3 h-[18px] w-[18px] shrink-0 text-gray-400" strokeWidth={1.5} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault()
                setIndex((i) => Math.min(i + 1, entries.length - 1))
              } else if (e.key === "ArrowUp") {
                e.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (e.key === "Enter") {
                e.preventDefault()
                go(entries[active])
              }
            }}
            className="flex-1 bg-transparent py-4 text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            placeholder="Seite öffnen oder Kandidaten und Kunden suchen …"
          />
          <kbd className="ml-2 hidden h-5 items-center rounded border px-1.5 font-mono text-[10px] font-medium text-gray-500 sm:inline-flex" style={{ borderColor: "#dde3ea" }}>
            ESC
          </kbd>
          <button type="button" onClick={close} aria-label="Schnellsuche schließen" className="ml-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-2 py-8">
            <Command className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-gray-500">Nichts gefunden</p>
          </div>
        ) : (
          <ul className="max-h-[50vh] overflow-y-auto p-1.5">
            {entries.map((entry, i) => (
              <li key={entry.key}>
                <button
                  type="button"
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => go(entry)}
                  className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-gray-700"
                  style={i === active ? { backgroundColor: "#1e56a014", color: "#1e56a0" } : undefined}
                >
                  <entry.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.hint && <span className="text-[11px] text-gray-400">{entry.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
