"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react"
import type { ClientLocation } from "@/lib/client-locations"
import {
  addClientLocationAction,
  deleteClientLocationAction,
  setPrimaryClientLocationAction,
  updateClientLocationAction,
  type LocationInput,
} from "./location-actions"

const EMPTY: LocationInput = { strasse: "", plz: "", ort: "" }
const input = "rounded-md border px-2 py-1 text-sm"

// Standorte eines Kunden (Paket 16, T-75) - dieselbe Liste im Kanzleiprofil und in den
// Stammdaten. Der Hauptstandort steht in den Stammdaten-Feldern PLZ/Ort; alle Standorte
// erscheinen auf der Karte.
export function LocationsCard({
  clientId,
  locations,
  closeHint,
  title = "Standorte",
}: {
  clientId: string
  locations: ClientLocation[]
  closeHint?: string | null
  title?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ id: string | null; values: LocationInput } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const sorted = [...locations].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.plz.localeCompare(b.plz))

  function run(action: () => Promise<{ error: string } | null>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) return setError(result.error)
      onDone?.()
      router.refresh()
    })
  }

  function save() {
    if (!editing) return
    const { id, values } = editing
    run(() => (id ? updateClientLocationAction(clientId, id, values) : addClientLocationAction(clientId, values)), () => setEditing(null))
  }

  const form = editing && (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2" style={{ borderColor: "#1e56a0" }}>
      <input className={`${input} min-w-[160px] flex-1`} style={{ borderColor: "#dde3ea" }} placeholder="Straße (optional)" value={editing.values.strasse} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, strasse: e.target.value } })} />
      <input className={`${input} w-20`} style={{ borderColor: "#dde3ea" }} placeholder="PLZ" maxLength={5} inputMode="numeric" value={editing.values.plz} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, plz: e.target.value } })} />
      <input className={`${input} min-w-[120px] flex-1`} style={{ borderColor: "#dde3ea" }} placeholder="Ort (wird sonst ermittelt)" value={editing.values.ort} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, ort: e.target.value } })} />
      <button type="button" onClick={save} disabled={pending} className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
        {pending ? "…" : "Speichern"}
      </button>
      <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:underline">
        Abbrechen
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {title} ({locations.length})
        </span>
        {!editing && (
          <button type="button" onClick={() => setEditing({ id: null, values: EMPTY })} className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
            <Plus size={13} /> Standort hinzufügen
          </button>
        )}
      </div>

      {locations.length === 0 && !editing && <p className="text-sm" style={{ color: "#dc2626" }}>Noch kein Standort hinterlegt.</p>}

      {sorted.map((l) =>
        editing?.id === l.id ? (
          <div key={l.id}>{form}</div>
        ) : (
          <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "#dde3ea" }}>
            <MapPin size={14} className="shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 text-sm text-gray-800">
              {[l.strasse, [l.plz, l.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              {l.lat === null && <span className="ml-2 text-xs" style={{ color: "#b45309" }}>PLZ nicht gefunden – nicht auf der Karte</span>}
            </span>
            {l.is_primary ? (
              <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                <Star size={10} /> Hauptstandort
              </span>
            ) : (
              <button type="button" onClick={() => run(() => setPrimaryClientLocationAction(clientId, l.id))} disabled={pending} className="text-xs text-gray-500 hover:underline disabled:opacity-50">
                Als Hauptstandort
              </button>
            )}
            <button type="button" onClick={() => setEditing({ id: l.id, values: { strasse: l.strasse ?? "", plz: l.plz, ort: l.ort ?? "" } })} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Standort bearbeiten">
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => confirm(`Standort ${l.plz} ${l.ort ?? ""} entfernen?`) && run(() => deleteClientLocationAction(clientId, l.id))}
              disabled={pending}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              aria-label="Standort entfernen"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )
      )}

      {editing && !editing.id && form}
      {closeHint && <p className="text-xs text-gray-400">Angabe aus Close: {closeHint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
