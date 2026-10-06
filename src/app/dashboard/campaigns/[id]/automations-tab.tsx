"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Mail, ChevronDown } from "lucide-react"
import {
  createAutomationAction,
  updateAutomationAction,
  deleteAutomationAction,
  toggleAutomationActiveAction,
  applyAutomationTemplatesAction,
  type AutomationData,
} from "./automations-actions"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import {
  AUTOMATION_DELAY_OPTIONS,
  AUTOMATION_RECIPIENT_OPTIONS,
  CAMPAIGN_TRIGGER_OPTIONS,
  AUTOMATION_VARIABLES,
  automationRecipientLabel,
  automationTriggerLabel,
  isCampaignTrigger,
} from "@/lib/automation-templates"
import type { AutomationTemplate, AutomationTemplateSet } from "../../einstellungen/automation-template-actions"

export interface Automation {
  id: string
  campaign_id: string
  name: string
  trigger: string
  trigger_status: string | null
  delay_seconds: number
  active: boolean
  recipient: string
  subject: string
  body_html: string
  created_at: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = CAMPAIGN_TRIGGER_OPTIONS
const STATUS_OPTIONS = CANDIDATE_STATUS_OPTIONS
const DELAY_OPTIONS = AUTOMATION_DELAY_OPTIONS
const RECIPIENT_OPTIONS = AUTOMATION_RECIPIENT_OPTIONS

const DEFAULT_FORM: AutomationData = {
  name: "",
  trigger: "new_lead",
  trigger_status: null,
  delay_seconds: 30,
  active: true,
  recipient: "candidate",
  subject: "",
  body_html: "",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const triggerLabel = automationTriggerLabel
const recipientLabel = automationRecipientLabel

// ── Main component ────────────────────────────────────────────────────────────

export function AutomationsTab({
  campaignId,
  automations: serverAutomations,
  templates,
  templateSets,
}: {
  campaignId: string
  automations: Automation[]
  templates: AutomationTemplate[]
  templateSets: AutomationTemplateSet[]
}) {
  const router = useRouter()
  // Nur der Aktiv-Schalter wird optimistisch überschrieben; die Liste selbst kommt immer
  // aus den Server-Props (vorher kopierter Zustand: Neues erschien erst nach Neuladen).
  const [activeOverrides, setActiveOverrides] = useState<Record<string, boolean>>({})
  const automations = serverAutomations.map((a) => (a.id in activeOverrides ? { ...a, active: activeOverrides[a.id] } : a))
  const [applyValue, setApplyValue] = useState("")
  const [applyMessage, setApplyMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [applyPending, startApplyTransition] = useTransition()
  const [modal, setModal] = useState<{ automation: Automation | null; isNew: boolean } | null>(null)
  const [form, setForm] = useState<AutomationData>(DEFAULT_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [savePending, startSaveTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null)

  function openNew() {
    setForm(DEFAULT_FORM)
    setFormError(null)
    setModal({ automation: null, isNew: true })
  }

  function openEdit(a: Automation) {
    setForm({
      name: a.name,
      trigger: a.trigger,
      trigger_status: a.trigger_status,
      delay_seconds: a.delay_seconds,
      active: a.active,
      recipient: a.recipient,
      subject: a.subject,
      body_html: a.body_html,
    })
    setFormError(null)
    setModal({ automation: a, isNew: false })
  }

  function closeModal() {
    setModal(null)
    setFormError(null)
  }

  // Vorlage aus den Einstellungen in den Editor laden (alle Felder).
  function handleTemplateSelect(id: string) {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    setForm((prev) => ({
      ...prev,
      name: prev.name || tpl.name,
      trigger: tpl.trigger,
      trigger_status: tpl.trigger_status,
      delay_seconds: tpl.delay_seconds,
      recipient: tpl.recipient,
      subject: tpl.subject,
      body_html: tpl.body_html,
    }))
  }

  // Vorlage oder Vorlagenset direkt als (ausgeschaltete) Automatisierungen übernehmen.
  function handleApply() {
    if (!applyValue) return
    setApplyMessage(null)
    const source = applyValue.startsWith("set:") ? { setId: applyValue.slice(4) } : { templateId: applyValue.slice(4) }
    startApplyTransition(async () => {
      const result = await applyAutomationTemplatesAction(campaignId, source)
      if ("error" in result) return setApplyMessage({ ok: false, text: result.error })
      setApplyMessage({
        ok: true,
        text: result.added > 0 ? `${result.added} übernommen – zum Versenden noch einschalten.` : "Schon vorhanden, nichts übernommen.",
      })
      setApplyValue("")
      router.refresh()
    })
  }

  function handleSave() {
    if (!form.name.trim()) { setFormError("Name ist ein Pflichtfeld."); return }
    if (!form.subject.trim()) { setFormError("Betreff ist ein Pflichtfeld."); return }
    setFormError(null)

    startSaveTransition(async () => {
      if (modal?.isNew) {
        const result = await createAutomationAction(campaignId, form)
        if ("error" in result) { setFormError(result.error); return }
        router.refresh()
        closeModal()
      } else if (modal?.automation) {
        const result = await updateAutomationAction(modal.automation.id, campaignId, form)
        if (result?.error) { setFormError(result.error); return }
        router.refresh()
        closeModal()
      }
    })
  }

  function handleDelete() {
    if (!modal?.automation) return
    startDeleteTransition(async () => {
      const result = await deleteAutomationAction(modal.automation!.id, campaignId)
      if (result?.error) { setFormError(result.error); return }
      router.refresh()
      closeModal()
    })
  }

  async function handleToggle(a: Automation) {
    setTogglePendingId(a.id)
    const newActive = !a.active
    setActiveOverrides((prev) => ({ ...prev, [a.id]: newActive }))
    const result = await toggleAutomationActiveAction(a.id, campaignId, newActive)
    if (result?.error) setActiveOverrides((prev) => ({ ...prev, [a.id]: a.active }))
    setTogglePendingId(null)
  }

  const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
  const inputStyle = { borderColor: "#dde3ea" }
  const selectClass = inputClass + " appearance-none bg-white pr-8"

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          {automations.length} Automatisierung{automations.length !== 1 ? "en" : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={applyValue}
              onChange={(e) => setApplyValue(e.target.value)}
              className="appearance-none rounded-md border bg-white py-1.5 pl-3 pr-8 text-sm"
              style={{ borderColor: "#dde3ea" }}
              aria-label="Vorlage oder Vorlagenset übernehmen"
            >
              <option value="">Vorlage übernehmen…</option>
              {templateSets.length > 0 && (
                <optgroup label="Vorlagensets">
                  {templateSets.map((s) => (
                    <option key={s.id} value={`set:${s.id}`}>{s.name}{s.is_default ? " (Standard)" : ""}</option>
                  ))}
                </optgroup>
              )}
              {templates.length > 0 && (
                <optgroup label="Einzelne Vorlagen">
                  {templates.filter((t) => isCampaignTrigger(t.trigger)).map((t) => (
                    <option key={t.id} value={`tpl:${t.id}`}>{t.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
          <button
            type="button"
            onClick={handleApply}
            disabled={!applyValue || applyPending}
            className="rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            style={{ borderColor: "#1e56a0", color: "#1e56a0" }}
          >
            {applyPending ? "…" : "Übernehmen"}
          </button>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          <Plus size={14} />
          Neue Automatisierung
        </button>
        </div>
      </div>
      {applyMessage && <p className="text-xs" style={{ color: applyMessage.ok ? "#1a9a6a" : "#dc2626" }}>{applyMessage.text}</p>}

      {/* List */}
      {automations.length === 0 ? (
        <div
          className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400"
          style={{ borderColor: "#dde3ea" }}
        >
          Noch keine Automatisierungen angelegt.
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-x-auto" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #dde3ea" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">An</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Aktiv</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {automations.map((a, i) => (
                <tr
                  key={a.id}
                  style={{ borderTop: i > 0 ? "1px solid #f1f5f9" : undefined }}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">{a.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{triggerLabel(a.trigger, a.trigger_status)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{recipientLabel(a.recipient)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(a)}
                      disabled={togglePendingId === a.id}
                      className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50"
                      style={{ backgroundColor: a.active ? "#1e56a0" : "#d1d5db" }}
                      aria-label={a.active ? "Deaktivieren" : "Aktivieren"}
                    >
                      <span
                        className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                        style={{ transform: a.active ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openEdit(a)}
                      className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="flex w-full max-w-2xl flex-col rounded-xl border bg-white shadow-xl"
            style={{ borderColor: "#dde3ea", maxHeight: "90vh" }}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "#dde3ea" }}>
              <h2 className="text-base font-semibold text-gray-900">
                {modal.isNew ? "Neue Automatisierung" : "Automatisierung bearbeiten"}
              </h2>
              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{form.active ? "Aktiv" : "Inaktiv"}</span>
                <button
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors"
                  style={{ backgroundColor: form.active ? "#1e56a0" : "#d1d5db" }}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform"
                    style={{ transform: form.active ? "translateX(18px)" : "translateX(2px)" }}
                  />
                </button>
              </div>
            </div>

            {/* Modal body — scrollable */}
            <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">

              {/* Name + Template */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Name *</label>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    placeholder="z. B. Eingangsbestätigung"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Vorlage wählen</label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      style={inputStyle}
                      defaultValue=""
                      onChange={(e) => handleTemplateSelect(e.target.value)}
                    >
                      <option value="">— Vorlage auswählen —</option>
                      {templates.filter((t) => isCampaignTrigger(t.trigger)).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Trigger */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Trigger</label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      style={inputStyle}
                      value={form.trigger}
                      onChange={(e) => setForm((f) => ({ ...f, trigger: e.target.value, trigger_status: null }))}
                    >
                      {TRIGGER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                {form.trigger === "status_change" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-600">Bei Status</label>
                    <div className="relative">
                      <select
                        className={selectClass}
                        style={inputStyle}
                        value={form.trigger_status ?? ""}
                        onChange={(e) => setForm((f) => ({ ...f, trigger_status: e.target.value || null }))}
                      >
                        <option value="">— Status wählen —</option>
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Zeitliche Verzögerung</label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      style={inputStyle}
                      value={form.delay_seconds}
                      onChange={(e) => setForm((f) => ({ ...f, delay_seconds: Number(e.target.value) }))}
                    >
                      {DELAY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Recipient */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Empfänger</label>
                <div className="flex gap-2">
                  {RECIPIENT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setForm((f) => ({ ...f, recipient: o.value }))}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        borderColor: form.recipient === o.value ? "#1e56a0" : "#dde3ea",
                        backgroundColor: form.recipient === o.value ? "#1e56a018" : "white",
                        color: form.recipient === o.value ? "#1e56a0" : "#6b7280",
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">
                  Betreff *{" "}
                  <span className="font-normal text-gray-400">
                    — Variablen: {AUTOMATION_VARIABLES.join(", ")}
                  </span>
                </label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Betreff der E-Mail"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">E-Mail-Inhalt</label>
                <textarea
                  className={inputClass}
                  style={{ ...inputStyle, resize: "vertical" }}
                  rows={8}
                  placeholder="Inhalt der E-Mail…"
                  value={form.body_html}
                  onChange={(e) => setForm((f) => ({ ...f, body_html: e.target.value }))}
                />
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: "#dde3ea" }}>
              <div className="flex items-center gap-2">
                {!modal.isNew && (
                  <button
                    onClick={handleDelete}
                    disabled={deletePending || savePending}
                    className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                    style={{ borderColor: "#fca5a5", color: "#dc2626" }}
                  >
                    <Trash2 size={13} />
                    Löschen
                  </button>
                )}
                <button
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-gray-400 cursor-not-allowed"
                  style={{ borderColor: "#dde3ea" }}
                  title="Testmail-Versand noch nicht implementiert"
                >
                  <Mail size={13} />
                  Testmail senden
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeModal}
                  disabled={savePending || deletePending}
                  className="rounded-md border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#dde3ea" }}
                >
                  Abbrechen
                </button>
                <button
                  onClick={handleSave}
                  disabled={savePending || deletePending}
                  className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1e56a0" }}
                >
                  {savePending ? "Wird gespeichert…" : "Speichern"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
