"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Copy, MapPinPlus, Pencil, Plus, Trash2 } from "lucide-react"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import {
  createCampaignFromPositionsAction,
  deletePositionAction,
  duplicatePositionAction,
  linkPositionToCampaignAction,
  savePositionAction,
  type PositionInput,
} from "./project-actions"

export interface ClientPosition extends PositionInput {
  id: string
  campaign_id: string | null
}

const EMPTY: PositionInput = {
  title: "",
  berufsbild: null,
  plz: null,
  ort: null,
  radius_km: 25,
  arbeitszeit: null,
  berufserfahrung: null,
  software: null,
  gehalt: null,
  startdatum: null,
  anforderungen: null,
  aufgaben: null,
}

const TEXT_FIELDS: { key: keyof PositionInput; label: string; multiline?: boolean; placeholder?: string }[] = [
  { key: "arbeitszeit", label: "Arbeitszeit", placeholder: "Vollzeit / Teilzeit, Stunden" },
  { key: "berufserfahrung", label: "Berufserfahrung", placeholder: "z.B. ab 2 Jahre" },
  { key: "software", label: "Software / Buchhaltungsprogramm", placeholder: "z.B. DATEV" },
  { key: "gehalt", label: "Gehalt", placeholder: "z.B. 45.000–55.000 €" },
  { key: "startdatum", label: "Start", placeholder: "z.B. ab sofort" },
  { key: "aufgaben", label: "Aufgaben", multiline: true },
  { key: "anforderungen", label: "Weitere Anforderungen", multiline: true },
]

// Gesuchte Stellen des Kunden (Paket 9). Aus einer oder mehreren Stellen wird per
// Knopf eine Kanzlei-Kampagne; alternativ mit einer bestehenden verknüpfen.
export function ProjectPositions({
  clientId,
  positions,
  campaigns,
}: {
  clientId: string
  positions: ClientPosition[]
  campaigns: { id: string; title: string }[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<PositionInput | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [campaignTitle, setCampaignTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // Weiterer Standort für eine Stelle (Paket 13).
  const [locationFor, setLocationFor] = useState<string | null>(null)
  const [newLocation, setNewLocation] = useState({ plz: "", ort: "", radius: "" })
  const sameTitleCount = (title: string) => positions.filter((p) => p.title.trim().toLowerCase() === title.trim().toLowerCase()).length

  const unlinked = positions.filter((p) => !p.campaign_id)
  const campaignTitleOf = (id: string | null) => campaigns.find((c) => c.id === id)?.title ?? "Kampagne"

  function run(action: () => Promise<{ error: string } | null | { campaignId: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result && "error" in result) return setError(result.error)
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Gesuchte Stellen ({positions.length})</h3>
        {!editing && (
          <button type="button" onClick={() => setEditing({ ...EMPTY })} className="inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
            <Plus size={13} /> Stelle hinzufügen
          </button>
        )}
      </div>

      {editing && (
        <PositionForm
          value={editing}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(v) => run(() => savePositionAction(clientId, v), () => setEditing(null))}
        />
      )}

      {positions.length === 0 && !editing && <p className="text-sm text-gray-400">Noch keine Stelle hinterlegt.</p>}

      {positions.map((p) => (
        <div key={p.id} className="rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
          <div className="flex items-start gap-2">
            {!p.campaign_id && (
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(p.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((id) => id !== p.id))}
                aria-label="Für Kampagne auswählen"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900">
                {p.title}
                {sameTitleCount(p.title) > 1 && (
                  <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                    {sameTitleCount(p.title)} Standorte
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">
                {[
                  BERUFSBILD_OPTIONS.find((o) => o.value === p.berufsbild)?.label ?? "Berufsbild offen",
                  p.plz ? `${p.plz}${p.ort ? ` ${p.ort}` : ""}${p.radius_km ? `, ${p.radius_km} km` : ""}` : p.ort,
                  p.arbeitszeit,
                  p.berufserfahrung,
                  p.software,
                  p.gehalt,
                  p.startdatum,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {(p.aufgaben || p.anforderungen) && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{[p.aufgaben, p.anforderungen].filter(Boolean).join(" · ")}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {p.campaign_id ? (
                  <>
                    <Link href={`/dashboard/campaigns/${p.campaign_id}`} className="rounded-full px-2 py-0.5 font-medium" style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}>
                      Kampagne: {campaignTitleOf(p.campaign_id)}
                    </Link>
                    <button type="button" onClick={() => run(() => linkPositionToCampaignAction(clientId, p.id, null))} className="text-gray-500 hover:underline">
                      Verknüpfung lösen
                    </button>
                  </>
                ) : (
                  campaigns.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => e.target.value && run(() => linkPositionToCampaignAction(clientId, p.id, e.target.value))}
                      className="rounded-md border px-2 py-0.5"
                      style={{ borderColor: "#dde3ea" }}
                    >
                      <option value="">Mit bestehender Kampagne verknüpfen…</option>
                      {campaigns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setLocationFor(locationFor === p.id ? null : p.id)
                  setNewLocation({ plz: "", ort: "", radius: p.radius_km ? String(p.radius_km) : "" })
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Weiterer Standort"
                title="Dieselbe Stelle an einem weiteren Standort"
              >
                <MapPinPlus size={13} />
              </button>
              <button
                type="button"
                onClick={() => run(() => duplicatePositionAction(clientId, p.id, null))}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Duplizieren"
                title="Stelle duplizieren"
              >
                <Copy size={13} />
              </button>
              <button type="button" onClick={() => setEditing({ ...p })} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Bearbeiten" title="Bearbeiten">
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => confirm(`Stelle „${p.title}“ löschen?`) && run(() => deletePositionAction(clientId, p.id))}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                aria-label="Löschen"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
          {locationFor === p.id && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: "#eef2f6" }}>
              <span className="w-full text-xs text-gray-500">Gleiche Stelle an einem weiteren Standort suchen:</span>
              <input
                value={newLocation.plz}
                onChange={(e) => setNewLocation({ ...newLocation, plz: e.target.value })}
                placeholder="PLZ"
                maxLength={5}
                inputMode="numeric"
                className="w-20 rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "#dde3ea" }}
              />
              <input
                value={newLocation.ort}
                onChange={(e) => setNewLocation({ ...newLocation, ort: e.target.value })}
                placeholder="Ort"
                className="min-w-[120px] flex-1 rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "#dde3ea" }}
              />
              <input
                value={newLocation.radius}
                onChange={(e) => setNewLocation({ ...newLocation, radius: e.target.value })}
                placeholder="km"
                type="number"
                className="w-20 rounded-md border px-2 py-1 text-sm"
                style={{ borderColor: "#dde3ea" }}
                aria-label="Umkreis in km"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => duplicatePositionAction(clientId, p.id, { plz: newLocation.plz, ort: newLocation.ort, radius_km: newLocation.radius ? Number(newLocation.radius) : null }),
                    () => setLocationFor(null)
                  )
                }
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1e56a0" }}
              >
                Standort hinzufügen
              </button>
            </div>
          )}
        </div>
      ))}

      {unlinked.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "#eef2f6" }}>
          <span className="text-xs text-gray-500">
            {selected.length === 0
              ? "Stellen ankreuzen, um daraus eine Kampagne anzulegen (mehrere = zusammengelegt)."
              : `${selected.length} Stelle${selected.length === 1 ? "" : "n"} ausgewählt`}
          </span>
          {selected.length > 0 && (
            <>
              <input
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder={positions.filter((p) => selected.includes(p.id)).map((p) => p.title).join(" / ")}
                className="min-w-[200px] flex-1 rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "#dde3ea" }}
                aria-label="Titel der Kampagne"
              />
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => createCampaignFromPositionsAction(clientId, selected, campaignTitle),
                    () => {
                      setSelected([])
                      setCampaignTitle("")
                    }
                  )
                }
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1e56a0" }}
              >
                Kampagne anlegen
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function PositionForm({ value, pending, onSave, onCancel }: { value: PositionInput; pending: boolean; onSave: (v: PositionInput) => void; onCancel: () => void }) {
  const [v, setV] = useState<PositionInput>(value)
  const input = "w-full rounded-md border px-2 py-1.5 text-sm"
  const set = (key: keyof PositionInput, val: string) => setV({ ...v, [key]: val })

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "#1e56a0" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Bezeichnung *">
          <input className={input} style={{ borderColor: "#dde3ea" }} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="z.B. Steuerfachangestellte (m/w/d)" />
        </Field>
        <Field label="Berufsbild">
          <select className={input} style={{ borderColor: "#dde3ea" }} value={v.berufsbild ?? ""} onChange={(e) => set("berufsbild", e.target.value)}>
            <option value="">Bitte wählen</option>
            {BERUFSBILD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2 sm:col-span-2">
          <Field label="PLZ">
            <input className={input} style={{ borderColor: "#dde3ea" }} value={v.plz ?? ""} onChange={(e) => set("plz", e.target.value)} maxLength={5} inputMode="numeric" />
          </Field>
          <Field label="Ort">
            <input className={input} style={{ borderColor: "#dde3ea" }} value={v.ort ?? ""} onChange={(e) => set("ort", e.target.value)} />
          </Field>
          <Field label="Umkreis (km)">
            <input
              className={input}
              style={{ borderColor: "#dde3ea" }}
              type="number"
              value={v.radius_km ?? ""}
              onChange={(e) => setV({ ...v, radius_km: e.target.value ? Number(e.target.value) : null })}
            />
          </Field>
        </div>
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} wide={f.multiline}>
            {f.multiline ? (
              <textarea className={input} style={{ borderColor: "#dde3ea" }} rows={3} value={(v[f.key] as string | null) ?? ""} onChange={(e) => set(f.key, e.target.value)} />
            ) : (
              <input className={input} style={{ borderColor: "#dde3ea" }} value={(v[f.key] as string | null) ?? ""} onChange={(e) => set(f.key, e.target.value)} placeholder={f.placeholder} />
            )}
          </Field>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onSave(v)} disabled={pending} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "Speichert…" : "Stelle speichern"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:underline">
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      {children}
    </label>
  )
}
