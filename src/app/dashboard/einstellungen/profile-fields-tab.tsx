"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { PROFILE_GROUPS } from "@/lib/client-project"
import { resolveAllFields, type FieldScope, type PositionSnippet, type ProfileFieldSetting, type ResolvedField } from "@/lib/profile-fields"
import {
  addCustomProfileFieldAction,
  deleteCustomProfileFieldAction,
  deleteSnippetAction,
  resetProfileFieldAction,
  saveProfileFieldAction,
  saveSnippetAction,
  type FieldSettingInput,
} from "./profile-field-actions"

const input = "w-full rounded-md border px-2 py-1 text-sm"
const border = { borderColor: "#dde3ea" }

// Felder von Kanzleiprofil bzw. Stellenprofil (Paket 18, T-80): Bezeichnung, Hinweis,
// Pflicht und Sichtbarkeit anpassen, eigene Felder anlegen.
export function ProfileFieldsEditor({ scope, settings }: { scope: FieldScope; settings: ProfileFieldSetting[] }) {
  const router = useRouter()
  const fields = resolveAllFields(scope, settings)
  const overridden = new Set(settings.filter((s) => s.scope === scope && !s.is_custom).map((s) => s.key))
  const [editing, setEditing] = useState<{ key: string | null; custom: boolean; values: FieldSettingInput } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error: string } | null>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) return setError(result.error)
      after?.()
      router.refresh()
    })
  }

  function edit(f: ResolvedField) {
    setEditing({
      key: f.key,
      custom: f.custom,
      values: { label: f.label, hint: f.hint ?? "", required: f.required, active: f.active, multiline: f.multiline, field_group: f.group },
    })
  }

  function save() {
    if (!editing) return
    const { key, custom, values } = editing
    run(() => (key ? saveProfileFieldAction(scope, key, custom, values) : addCustomProfileFieldAction(scope, values)), () => setEditing(null))
  }

  const form = editing && (
    <div className="flex flex-col gap-2 rounded-lg border bg-white p-3" style={{ borderColor: "#1e56a0" }}>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Bezeichnung *
          <input className={input} style={border} value={editing.values.label} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, label: e.target.value } })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Hinweis im Feld
          <input className={input} style={border} value={editing.values.hint} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, hint: e.target.value } })} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-700">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={editing.values.required} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, required: e.target.checked } })} />
          Pflicht
        </label>
        {editing.key && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={editing.values.active} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, active: e.target.checked } })} />
            Sichtbar
          </label>
        )}
        {(editing.custom || !editing.key) && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={editing.values.multiline} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, multiline: e.target.checked } })} />
            Mehrzeilig
          </label>
        )}
        {scope === "kanzlei" && (editing.custom || !editing.key) && (
          <select className="rounded-md border px-2 py-1 text-sm" style={border} value={editing.values.field_group ?? "kanzlei"} onChange={(e) => setEditing({ ...editing, values: { ...editing.values, field_group: e.target.value } })}>
            {PROFILE_GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                Abschnitt: {g.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "…" : "Speichern"}
        </button>
        <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:underline">
          Abbrechen
        </button>
      </div>
    </div>
  )

  const groupLabel = (g: string | null) => PROFILE_GROUPS.find((x) => x.value === g)?.label

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-gray-500">
        {scope === "stelle"
          ? "Bezeichnung, Berufsbild und Standort sind immer Pflicht. Pflichtangaben müssen gefüllt sein, bevor sich das Kanzleiprofil abschließen lässt."
          : "Pflichtangaben müssen gefüllt sein, bevor sich das Kanzleiprofil abschließen lässt. Ausgeblendete Felder behalten ihre Werte."}
      </p>
      {fields.map((f) =>
        editing?.key === f.key ? (
          <div key={f.key}>{form}</div>
        ) : (
          <div key={f.key} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-2" style={{ borderColor: "#dde3ea", opacity: f.active ? 1 : 0.55 }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-900">
                {f.label}
                {f.required && <span className="ml-1 text-xs font-medium" style={{ color: "#dc2626" }}>Pflicht</span>}
                {!f.active && <span className="ml-1 text-xs text-gray-400">ausgeblendet</span>}
                {f.custom && <span className="ml-1 rounded-full px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>eigenes Feld</span>}
              </p>
              <p className="text-xs text-gray-400">
                {[scope === "kanzlei" && groupLabel(f.group), !f.custom && f.label !== f.defaultLabel && `Standard: ${f.defaultLabel}`, f.hint].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button type="button" onClick={() => edit(f)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Feld bearbeiten">
              <Pencil size={13} />
            </button>
            {!f.custom && overridden.has(f.key) && (
              <button type="button" onClick={() => run(() => resetProfileFieldAction(scope, f.key))} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Auf Standard zurücksetzen" title="Auf Standard zurücksetzen">
                <RotateCcw size={13} />
              </button>
            )}
            {f.custom && (
              <button
                type="button"
                onClick={() => confirm(`Feld „${f.label}“ löschen? Bereits erfasste Werte werden nicht mehr angezeigt.`) && run(() => deleteCustomProfileFieldAction(scope, f.key))}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Feld löschen"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )
      )}
      {editing && !editing.key ? (
        form
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ key: null, custom: true, values: { label: "", hint: "", required: false, active: true, multiline: false, field_group: scope === "kanzlei" ? "kanzlei" : null } })}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: "#1e56a0" }}
        >
          <Plus size={13} /> Eigenes Feld hinzufügen
        </button>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Textbausteine je Berufsbild für Aufgaben und Anforderungen (Paket 18, T-80).
export function SnippetsEditor({ snippets }: { snippets: PositionSnippet[] }) {
  const bb = useBerufsbilder()
  const router = useRouter()
  const options = [...bb.choices().filter((o) => o.value !== "sonstige"), { value: "sonstige", label: "Sonstige / ohne Berufsbild" }]
  const [berufsbild, setBerufsbild] = useState<string>(options[0].value)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error: string } | null>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) return setError(result.error)
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <select className="w-fit rounded-md border px-2 py-1 text-sm" style={border} value={berufsbild} onChange={(e) => setBerufsbild(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="grid gap-4 md:grid-cols-2">
        {(["aufgaben", "anforderungen"] as const).map((kind) => {
          const list = snippets.filter((s) => s.berufsbild === berufsbild && s.kind === kind).sort((a, b) => a.sort_order - b.sort_order)
          return (
            <div key={kind} className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-gray-700">
                {kind === "aufgaben" ? "Aufgaben" : "Anforderungen"} ({list.length})
              </span>
              {list.map((s) =>
                editId === s.id ? (
                  <div key={s.id} className="flex items-center gap-1.5">
                    <input autoFocus className={input} style={border} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <button type="button" disabled={pending} onClick={() => run(() => saveSnippetAction(s.id, { berufsbild, kind, text: editText }), () => setEditId(null))} className="rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
                      OK
                    </button>
                    <button type="button" onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">
                      Abbrechen
                    </button>
                  </div>
                ) : (
                  <div key={s.id} className="flex items-start gap-1.5 rounded-md border bg-white px-2 py-1.5" style={border}>
                    <span className="flex-1 text-sm text-gray-800">{s.text}</span>
                    <button type="button" onClick={() => (setEditId(s.id), setEditText(s.text))} className="rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label="Baustein bearbeiten">
                      <Pencil size={12} />
                    </button>
                    <button type="button" disabled={pending} onClick={() => run(() => deleteSnippetAction(s.id))} className="rounded p-0.5 text-gray-400 hover:text-red-600" aria-label="Baustein löschen">
                      <Trash2 size={12} />
                    </button>
                  </div>
                )
              )}
              <div className="flex items-center gap-1.5">
                <input
                  className={input}
                  style={border}
                  placeholder="Neuer Baustein"
                  value={drafts[kind] ?? ""}
                  onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (drafts[kind] ?? "").trim()) {
                      e.preventDefault()
                      run(() => saveSnippetAction(null, { berufsbild, kind, text: drafts[kind] }), () => setDrafts({ ...drafts, [kind]: "" }))
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={pending || !(drafts[kind] ?? "").trim()}
                  onClick={() => run(() => saveSnippetAction(null, { berufsbild, kind, text: drafts[kind] }), () => setDrafts({ ...drafts, [kind]: "" }))}
                  className="rounded-md border p-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  style={border}
                  aria-label="Baustein hinzufügen"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
