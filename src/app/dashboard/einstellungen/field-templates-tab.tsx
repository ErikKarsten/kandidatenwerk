"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Plus, Star, Trash2, X } from "lucide-react"
import {
  createFieldTemplateAction,
  deleteFieldTemplateAction,
  setDefaultFieldTemplateAction,
  updateFieldTemplateAction,
  type FieldTemplate,
} from "./field-actions"
import type { CustomFieldDefinition } from "./actions"

// Einstellungen -> Feld-Vorlagen (Paket 8): welche Zusatzfelder in welcher Reihenfolge
// angezeigt werden. Auswahl je Kanzlei-Kampagne (Einrichtung), ohne Auswahl gilt die
// Standardvorlage.
export function FieldTemplatesTab({
  templates,
  fields,
  isAdmin,
}: {
  templates: FieldTemplate[]
  fields: CustomFieldDefinition[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const [newName, setNewName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const result = await createFieldTemplateAction(newName, fields.map((f) => f.key))
      if (result?.error) return setError(result.error)
      setNewName("")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
        <h2 className="text-sm font-semibold text-gray-900">Feld-Vorlagen</h2>
        <p className="mt-1 max-w-2xl text-xs text-gray-500">
          Eine Vorlage legt fest, welche Zusatzfelder (und in welcher Reihenfolge) im Kandidatenprofil und im Kundenportal
          angezeigt werden. In der Einrichtung jeder Kanzlei-Kampagne wählst du die Vorlage aus; ohne Auswahl gilt die
          Standardvorlage. Stammdaten-Felder werden immer angezeigt.
        </p>
        {isAdmin && (
          <div className="mt-4 flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name der neuen Vorlage, z.B. Steuerfachangestellte"
              className="flex-1 rounded-md border px-3 py-1.5 text-sm"
              style={{ borderColor: "#dde3ea" }}
            />
            <button
              onClick={handleCreate}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              <Plus size={13} /> Vorlage anlegen
            </button>
          </div>
        )}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {templates.length === 0 && (
        <p className="text-sm text-gray-400">Noch keine Vorlage – bis dahin werden überall alle Zusatzfelder angezeigt.</p>
      )}
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} fields={fields} isAdmin={isAdmin} />
      ))}
    </div>
  )
}

function TemplateCard({ template, fields, isAdmin }: { template: FieldTemplate; fields: CustomFieldDefinition[]; isAdmin: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [keys, setKeys] = useState<string[]>(template.field_keys.filter((k) => fields.some((f) => f.key === k)))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const labelOf = (key: string) => fields.find((f) => f.key === key)?.label ?? key
  const available = fields.filter((f) => !keys.includes(f.key))
  const dirty = name !== template.name || keys.join("|") !== template.field_keys.filter((k) => fields.some((f) => f.key === k)).join("|")

  function move(index: number, delta: number) {
    const next = [...keys]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    setKeys(next)
    setSaved(false)
  }

  function run(action: () => Promise<{ error: string } | null>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) return setError(result.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setSaved(false)
            }}
            disabled={!isAdmin}
            className="rounded-md border px-2 py-1 text-sm font-semibold text-gray-900 disabled:border-transparent disabled:bg-transparent"
            style={{ borderColor: "#dde3ea" }}
          />
          {template.is_default && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#f59e0b18", color: "#b45309" }}>
              <Star size={11} /> Standard
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex items-center gap-3">
            {!template.is_default && (
              <button onClick={() => run(() => setDefaultFieldTemplateAction(template.id))} disabled={pending} className="text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
                Als Standard
              </button>
            )}
            <button
              onClick={() => {
                if (confirm(`Vorlage „${template.name}“ löschen? Kampagnen damit nutzen danach die Standardvorlage.`)) run(() => deleteFieldTemplateAction(template.id))
              }}
              disabled={pending}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
              aria-label="Vorlage löschen"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Angezeigt ({keys.length})</p>
          {keys.length === 0 && <p className="text-xs text-gray-400">Keine Zusatzfelder.</p>}
          <ul className="flex flex-col gap-1">
            {keys.map((key, i) => (
              <li key={key} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm" style={{ borderColor: "#dde3ea" }}>
                <span className="truncate text-gray-800">{labelOf(key)}</span>
                {isAdmin && (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <IconButton label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp size={13} />
                    </IconButton>
                    <IconButton label="Nach unten" disabled={i === keys.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown size={13} />
                    </IconButton>
                    <IconButton
                      label="Entfernen"
                      onClick={() => {
                        setKeys(keys.filter((k) => k !== key))
                        setSaved(false)
                      }}
                    >
                      <X size={13} />
                    </IconButton>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Nicht angezeigt ({available.length})</p>
          <ul className="flex flex-col gap-1">
            {available.map((f) => (
              <li key={f.key} className="flex items-center justify-between rounded-md border border-dashed px-2 py-1.5 text-sm" style={{ borderColor: "#dde3ea" }}>
                <span className="truncate text-gray-500">{f.label}</span>
                {isAdmin && (
                  <IconButton
                    label="Hinzufügen"
                    onClick={() => {
                      setKeys([...keys, f.key])
                      setSaved(false)
                    }}
                  >
                    <Plus size={13} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {isAdmin && (
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => run(() => updateFieldTemplateAction(template.id, name, keys))}
            disabled={pending || !dirty}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {pending ? "Speichert…" : "Speichern"}
          </button>
          {saved && !dirty && <span className="text-xs" style={{ color: "#1a9a6a" }}>Gespeichert</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30">
      {children}
    </button>
  )
}
