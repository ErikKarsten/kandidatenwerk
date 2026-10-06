"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Star } from "lucide-react"
import {
  deleteAutomationTemplateAction,
  deleteAutomationTemplateSetAction,
  saveAutomationTemplateAction,
  saveAutomationTemplateSetAction,
  type AutomationTemplate,
  type AutomationTemplateInput,
  type AutomationTemplateSet,
} from "./automation-template-actions"
import {
  AUTOMATION_DELAY_OPTIONS,
  AUTOMATION_RECIPIENT_OPTIONS,
  AUTOMATION_TRIGGER_OPTIONS,
  AUTOMATION_VARIABLES,
  automationDelayLabel,
  automationRecipientLabel,
  automationTriggerLabel,
} from "@/lib/automation-templates"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

const EMPTY: AutomationTemplateInput = {
  name: "",
  trigger: "new_lead",
  trigger_status: null,
  delay_seconds: 30,
  recipient: "candidate",
  subject: "",
  body_html: "",
}

// Reiter "Automatisierungs-Vorlagen" (Paket 15, T-74): Vorlagen sind komplette
// Automatisierungen (Auslöser, Empfänger, Text); Vorlagensets bündeln mehrere davon.
// In der Kampagne wird eine Vorlage oder ein Set mit einem Klick übernommen, neue
// Kampagnen bekommen das Standard-Set automatisch (ausgeschaltet).
export function AutomationTemplatesTab({ templates, sets }: { templates: AutomationTemplate[]; sets: AutomationTemplateSet[] }) {
  return (
    <div className="flex flex-col gap-4">
      <TemplatesCard templates={templates} />
      <SetsCard templates={templates} sets={sets} />
      <p className="text-xs text-gray-400">
        Absender aller automatischen Mails ist info@kanzleistelle24.de. Übernommene Automatisierungen sind Kopien – Änderungen an
        einer Vorlage wirken nur für künftige Übernahmen.
      </p>
    </div>
  )
}

function TemplatesCard({ templates }: { templates: AutomationTemplate[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ id: string | null; form: AutomationTemplateInput } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await saveAutomationTemplateAction(editing.id, editing.form)
      if (result?.error) return setError(result.error)
      setEditing(null)
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteAutomationTemplateAction(id)
      if (result?.error) return setError(result.error)
      setConfirmDelete(null)
      router.refresh()
    })
  }

  const set = (patch: Partial<AutomationTemplateInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e))

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">E-Mail-Vorlagen</h2>
          <p className="text-xs text-gray-500">
            Alle Mails, die Kandidatenwerk verschickt: als Automatisierung in Kampagnen und – bei Empfänger „Kandidat“ – im Reiter „Kommunikation“ beim
            Kandidaten. „Nur manuell“ geht nie automatisch raus.
          </p>
        </div>
        <button
          type="button"
          onClick={() => (setEditing({ id: null, form: EMPTY }), setError(null))}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          <Plus size={13} /> Neue Vorlage
        </button>
      </div>

      {templates.length === 0 && <p className="text-sm text-gray-400">Noch keine Vorlagen.</p>}
      {templates.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{t.name}</p>
            <p className="text-xs text-gray-500">
              {automationTriggerLabel(t.trigger, t.trigger_status)} · an {automationRecipientLabel(t.recipient)} · nach {automationDelayLabel(t.delay_seconds)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (setEditing({ id: t.id, form: { ...t } }), setError(null))}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
            >
              Bearbeiten
            </button>
            {confirmDelete === t.id ? (
              <button type="button" onClick={() => remove(t.id)} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                Wirklich löschen?
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(t.id)} className="text-xs text-gray-400 hover:text-red-600">
                Löschen
              </button>
            )}
          </div>
        </div>
      ))}
      {error && !editing && <p className="text-xs text-red-600">{error}</p>}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b px-6 py-4" style={{ borderColor: "#dde3ea" }}>
              <h2 className="text-base font-semibold text-gray-900">{editing.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</h2>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
              <Field label="Name *">
                <input className={inputClass} style={inputStyle} value={editing.form.name} onChange={(e) => set({ name: e.target.value })} placeholder="z. B. Eingangsbestätigung" />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Auslöser">
                  <select className={inputClass} style={inputStyle} value={editing.form.trigger} onChange={(e) => set({ trigger: e.target.value, trigger_status: null, ...(e.target.value === "manual" ? { recipient: "candidate" } : {}) })}>
                    {AUTOMATION_TRIGGER_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                {editing.form.trigger === "status_change" && (
                  <Field label="Bei Status *">
                    <select className={inputClass} style={inputStyle} value={editing.form.trigger_status ?? ""} onChange={(e) => set({ trigger_status: e.target.value || null })}>
                      <option value="">— Status wählen —</option>
                      {CANDIDATE_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {editing.form.trigger !== "manual" && (
                <Field label="Verzögerung">
                  <select className={inputClass} style={inputStyle} value={editing.form.delay_seconds} onChange={(e) => set({ delay_seconds: Number(e.target.value) })}>
                    {AUTOMATION_DELAY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
                )}
                <Field label="Empfänger">
                  <select className={inputClass} style={inputStyle} value={editing.form.recipient} disabled={editing.form.trigger === "manual"} onChange={(e) => set({ recipient: e.target.value })}>
                    {AUTOMATION_RECIPIENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Betreff *">
                <input className={inputClass} style={inputStyle} value={editing.form.subject} onChange={(e) => set({ subject: e.target.value })} />
              </Field>
              <Field label="Text *">
                <textarea rows={10} className={inputClass} style={inputStyle} value={editing.form.body_html} onChange={(e) => set({ body_html: e.target.value })} />
              </Field>
              <p className="text-xs text-gray-500">Variablen: {AUTOMATION_VARIABLES.join(", ")}</p>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t px-6 py-3" style={{ borderColor: "#dde3ea" }}>
              <button type="button" onClick={() => setEditing(null)} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                Abbrechen
              </button>
              <button type="button" onClick={save} disabled={pending} className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
                {pending ? "Speichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SetsCard({ templates, sets }: { templates: AutomationTemplate[]; sets: AutomationTemplateSet[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<{ id: string | null; name: string; isDefault: boolean; templateIds: string[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const nameOf = (id: string) => templates.find((t) => t.id === id)?.name ?? "?"

  function save() {
    if (!editing) return
    setError(null)
    startTransition(async () => {
      const result = await saveAutomationTemplateSetAction(editing.id, editing)
      if (result?.error) return setError(result.error)
      setEditing(null)
      router.refresh()
    })
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deleteAutomationTemplateSetAction(id)
      if (result?.error) return setError(result.error)
      setConfirmDelete(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Vorlagensets</h2>
          <p className="text-xs text-gray-500">Mehrere Vorlagen auf einmal übernehmen. Das Standard-Set bekommt jede neue Kampagne (ausgeschaltet).</p>
        </div>
        <button
          type="button"
          onClick={() => (setEditing({ id: null, name: "", isDefault: sets.length === 0, templateIds: [] }), setError(null))}
          disabled={templates.length === 0}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          <Plus size={13} /> Neues Set
        </button>
      </div>

      {sets.length === 0 && <p className="text-sm text-gray-400">Noch keine Vorlagensets.</p>}
      {sets.map((s) =>
        editing?.id === s.id ? null : (
          <div key={s.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                {s.name}
                {s.is_default && (
                  <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "#f59e0b18", color: "#b45309" }}>
                    <Star size={10} /> Standard
                  </span>
                )}
              </p>
              <p className="text-xs text-gray-500">{s.templateIds.map(nameOf).join(" · ") || "leer"}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => (setEditing({ id: s.id, name: s.name, isDefault: s.is_default, templateIds: s.templateIds }), setError(null))}
                className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
              >
                Bearbeiten
              </button>
              {confirmDelete === s.id ? (
                <button type="button" onClick={() => remove(s.id)} disabled={pending} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">
                  Wirklich löschen?
                </button>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(s.id)} className="text-xs text-gray-400 hover:text-red-600">
                  Löschen
                </button>
              )}
            </div>
          </div>
        )
      )}

      {editing && (
        <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "#1e56a0" }}>
          <Field label="Name *">
            <input autoFocus className={inputClass} style={inputStyle} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="z. B. Standard" />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-600">Vorlagen im Set</span>
            {templates.filter((t) => t.trigger !== "manual").map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={editing.templateIds.includes(t.id)}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      templateIds: e.target.checked ? [...editing.templateIds, t.id] : editing.templateIds.filter((id) => id !== t.id),
                    })
                  }
                />
                {t.name}
                <span className="text-xs text-gray-400">{automationTriggerLabel(t.trigger, t.trigger_status)}</span>
              </label>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} />
            Standard-Set für neue Kampagnen
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={save} disabled={pending} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
              {pending ? "…" : "Speichern"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-xs text-gray-500 hover:underline">
              Abbrechen
            </button>
          </div>
        </div>
      )}
      {error && !editing && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  )
}
