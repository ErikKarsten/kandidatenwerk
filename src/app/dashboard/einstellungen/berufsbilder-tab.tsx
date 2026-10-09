"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp } from "lucide-react"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { createBerufsbildAction, moveBerufsbildAction, updateBerufsbildAction } from "./berufsbild-actions"

const border = { borderColor: "#dde3ea" }

// Einstellungen > Felder > Berufsbilder (Paket 45): Bezeichnung, Reihenfolge und aktiv/
// inaktiv; neue Berufsbilder anlegen. Nur Admins dürfen ändern.
export function BerufsbilderEditor({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter()
  const { all } = useBerufsbilder()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [newLabel, setNewLabel] = useState("")

  function run(action: () => Promise<{ error: string } | null>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) {
        setError(result.error)
        return
      }
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <p className="text-xs text-gray-500">
        Berufsbilder für Kandidaten, Kampagnen und Stellen. Deaktivierte erscheinen nicht mehr in den Auswahlfeldern, bestehende Kandidaten
        behalten sie.
      </p>
      <ul className="flex flex-col gap-1.5">
        {all.map((b, i) => (
          <li key={b.value} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={border}>
            {editKey === b.value ? (
              <>
                <input autoFocus value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm" style={border} />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => updateBerufsbildAction(b.value, { label: editLabel }), () => setEditKey(null))}
                  className="rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1e56a0" }}
                >
                  Speichern
                </button>
                <button type="button" onClick={() => setEditKey(null)} className="text-xs text-gray-500 hover:underline">
                  Abbrechen
                </button>
              </>
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate text-sm ${b.active === false ? "text-gray-400 line-through" : "text-gray-900"}`}>{b.label}</span>
                {b.active === false && <span className="text-xs text-gray-400">inaktiv</span>}
                {isAdmin && (
                  <>
                    <button type="button" disabled={pending || i === 0} onClick={() => run(() => moveBerufsbildAction(b.value, "up"))} className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30" aria-label="Nach oben">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" disabled={pending || i === all.length - 1} onClick={() => run(() => moveBerufsbildAction(b.value, "down"))} className="rounded p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-700 disabled:opacity-30" aria-label="Nach unten">
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditKey(b.value)
                        setEditLabel(b.label)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
                    >
                      Umbenennen
                    </button>
                    {b.value !== "sonstige" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => updateBerufsbildAction(b.value, { active: b.active === false }))}
                        className="text-xs text-gray-500 hover:text-gray-800 hover:underline disabled:opacity-50"
                      >
                        {b.active === false ? "Aktivieren" : "Deaktivieren"}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      {isAdmin && (
        <div className="flex items-center gap-2">
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newLabel.trim()) run(() => createBerufsbildAction(newLabel), () => setNewLabel(""))
            }}
            placeholder="Neues Berufsbild, z. B. Steuerberater-Assistent"
            className="min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm"
            style={border}
          />
          <button
            type="button"
            disabled={pending || !newLabel.trim()}
            onClick={() => run(() => createBerufsbildAction(newLabel), () => setNewLabel(""))}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            Hinzufügen
          </button>
        </div>
      )}
      {!isAdmin && <p className="text-xs text-gray-400">Ändern können nur Admins.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
