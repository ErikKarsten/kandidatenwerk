"use client"

import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MoreVertical, UserMinus } from "lucide-react"
import { removePortalAssignmentAction } from "@/app/portal/actions"

// Zeile eines zugeordneten Kandidaten im Portal (Liste und Kampagnenseite) mit Menü rechts:
// "Zuordnung entfernen" nach Rückfrage (Paket 28, T-109).
export function PortalCandidateRow({
  assignmentId,
  href,
  name,
  meta,
  status,
}: {
  assignmentId: string
  href: string
  name: string
  meta: string
  status: { label: string; bg: string; text: string }
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [menuOpen])

  function remove() {
    setError(null)
    startTransition(async () => {
      const res = await removePortalAssignmentAction(assignmentId)
      if (res?.error) {
        setError(res.error)
        return
      }
      setConfirming(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white transition-shadow hover:shadow-sm" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center gap-2 p-4">
        <Link href={href} className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{name}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{meta || "—"}</p>
          </div>
          <span className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: status.bg, color: status.text }}>
            {status.label}
          </span>
        </Link>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Weitere Aktionen"
            aria-expanded={menuOpen}
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border bg-white py-1 shadow-lg" style={{ borderColor: "#dde3ea" }}>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirming(true)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
              >
                <UserMinus size={14} />
                Zuordnung entfernen
              </button>
            </div>
          )}
        </div>
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3" style={{ borderColor: "#eef2f6", backgroundColor: "#fef2f2" }}>
          <p className="text-xs text-red-800">{name} aus deiner Liste entfernen? Der Kandidat wird dir dann nicht mehr angezeigt.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-gray-700" style={{ borderColor: "#dde3ea" }}>
              Abbrechen
            </button>
            <button type="button" onClick={remove} disabled={pending} className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60" style={{ backgroundColor: "#b91c1c" }}>
              {pending ? "Entfernen…" : "Entfernen"}
            </button>
          </div>
          {error && <p className="w-full text-xs text-red-700">{error}</p>}
        </div>
      )}
    </div>
  )
}
