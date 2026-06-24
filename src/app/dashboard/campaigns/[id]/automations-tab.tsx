"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, Pencil, Trash2, Mail, ChevronDown } from "lucide-react"
import {
  createAutomationAction,
  updateAutomationAction,
  deleteAutomationAction,
  toggleAutomationActiveAction,
  type AutomationData,
} from "./automations-actions"

export interface Automation {
  id: string
  campaign_id: string
  name: string
  trigger: string
  trigger_status: string | null
  delay_seconds: number
  active: boolean
  recipient: string
  sender_email: string
  sender_name: string
  subject: string
  body_html: string
  created_at: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  { value: "new_lead", label: "Neuer Lead" },
  { value: "status_change", label: "Statusänderung" },
]

const STATUS_OPTIONS = [
  { value: "neu", label: "Neu" },
  { value: "pruefung", label: "In Prüfung" },
  { value: "interview", label: "Interview" },
  { value: "vorgestellt", label: "Vorgestellt" },
  { value: "platziert", label: "Platziert" },
  { value: "abgelehnt", label: "Abgelehnt" },
]

const DELAY_OPTIONS = [
  { value: 10, label: "10 Sekunden" },
  { value: 30, label: "30 Sekunden" },
  { value: 60, label: "1 Minute" },
  { value: 300, label: "5 Minuten" },
]

const RECIPIENT_OPTIONS = [
  { value: "candidate", label: "Kandidat" },
  { value: "client", label: "Kunde (primärer Ansprechpartner)" },
  { value: "all_contacts", label: "Alle Kunden-Ansprechpartner" },
]

const TEMPLATES: Array<{
  id: string
  label: string
  trigger: string
  trigger_status: string | null
  recipient: string
  subject: string
  body_html: string
}> = [
  {
    id: "eingangsbestaetigung",
    label: "Eingangsbestätigung",
    trigger: "new_lead",
    trigger_status: null,
    recipient: "candidate",
    subject: "Deine Bewerbung als #Kampagnenname bei #Kundenname",
    body_html:
      "Hallo #Kandidatenname,\n\nvielen Dank für deine Bewerbung auf die Stelle als #Kampagnenname bei #Kundenname.\n\nWir haben deine Bewerbung erhalten und melden uns in Kürze bei dir.\n\nMit freundlichen Grüßen",
  },
  {
    id: "qualifizierter_lead",
    label: "Neuer qualifizierter Lead",
    trigger: "status_change",
    trigger_status: "vorgestellt",
    recipient: "client",
    subject: "Neuer qualifizierter Bewerber für #Kampagnenname",
    body_html:
      "Guten Tag,\n\nfür Ihre Kampagne \"#Kampagnenname\" wurde ein neuer Bewerber qualifiziert.\n\nName: #Kandidatenname\nE-Mail: #Email\nTelefon: #Telefon\n\nWir setzen uns zeitnah mit Ihnen in Verbindung.\n\nMit freundlichen Grüßen",
  },
  {
    id: "nicht_erreicht",
    label: "Nicht erreicht",
    trigger: "status_change",
    trigger_status: "interview",
    recipient: "candidate",
    subject: "Ihre Bewerbung als #Kampagnenname – Terminvereinbarung",
    body_html:
      "Hallo #Kandidatenname,\n\nwir haben versucht, Sie telefonisch zu erreichen, leider ohne Erfolg.\n\nGerne würden wir einen Termin für ein erstes Gespräch vereinbaren. Bitte melden Sie sich unter #Telefon oder antworten Sie auf diese E-Mail.\n\nMit freundlichen Grüßen",
  },
  {
    id: "absage",
    label: "Absage",
    trigger: "status_change",
    trigger_status: "abgelehnt",
    recipient: "candidate",
    subject: "Rückmeldung zu deiner Bewerbung bei #Kundenname",
    body_html:
      "Hallo #Kandidatenname,\n\nvielen Dank für dein Interesse an der Stelle als #Kampagnenname bei #Kundenname und die Zeit, die du in deine Bewerbung investiert hast.\n\nNach sorgfältiger Prüfung müssen wir dir leider mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben.\n\nWir wünschen dir für deinen weiteren Weg alles Gute.\n\nMit freundlichen Grüßen",
  },
]

const DEFAULT_FORM: AutomationData = {
  name: "",
  trigger: "new_lead",
  trigger_status: null,
  delay_seconds: 30,
  active: true,
  recipient: "candidate",
  sender_email: "",
  sender_name: "",
  subject: "",
  body_html: "",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function triggerLabel(t: string, ts: string | null): string {
  if (t === "new_lead") return "Neuer Lead"
  const statusLabel = STATUS_OPTIONS.find((s) => s.value === ts)?.label ?? ts
  return `Statusänderung → ${statusLabel}`
}

function recipientLabel(r: string): string {
  return RECIPIENT_OPTIONS.find((o) => o.value === r)?.label ?? r
}

// ── Main component ────────────────────────────────────────────────────────────

export function AutomationsTab({
  campaignId,
  automations: initialAutomations,
}: {
  campaignId: string
  automations: Automation[]
}) {
  const router = useRouter()
  const [automations, setAutomations] = useState(initialAutomations)
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
      sender_email: a.sender_email,
      sender_name: a.sender_name,
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

  function applyTemplate(templateId: string) {
    const tpl = TEMPLATES.find((t) => t.id === templateId)
    if (!tpl) return
    setForm((prev) => ({
      ...prev,
      name: prev.name || tpl.label,
      trigger: tpl.trigger,
      trigger_status: tpl.trigger_status,
      recipient: tpl.recipient,
      subject: tpl.subject,
      body_html: tpl.body_html,
    }))
  }

  function handleSave() {
    if (!form.name.trim()) { setFormError("Name ist ein Pflichtfeld."); return }
    if (!form.subject.trim()) { setFormError("Betreff ist ein Pflichtfeld."); return }
    if (!form.sender_email.trim()) { setFormError("Absender-E-Mail ist ein Pflichtfeld."); return }
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
    setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, active: newActive } : x))
    const result = await toggleAutomationActiveAction(a.id, campaignId, newActive)
    if (result?.error) {
      setAutomations((prev) => prev.map((x) => x.id === a.id ? { ...x, active: a.active } : x))
    }
    setTogglePendingId(null)
  }

  const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
  const inputStyle = { borderColor: "#dde3ea" }
  const selectClass = inputClass + " appearance-none bg-white pr-8"

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {automations.length} Automatisierung{automations.length !== 1 ? "en" : ""}
        </p>
        <button
          onClick={openNew}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          <Plus size={14} />
          Neue Automatisierung
        </button>
      </div>

      {/* List */}
      {automations.length === 0 ? (
        <div
          className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400"
          style={{ borderColor: "#dde3ea" }}
        >
          Noch keine Automatisierungen angelegt.
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid #dde3ea" }}>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Von</th>
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
                  <td className="px-4 py-3 text-gray-500 text-xs truncate max-w-[180px]">
                    {a.sender_name ? `${a.sender_name} <${a.sender_email}>` : a.sender_email || "—"}
                  </td>
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
              <div className="grid grid-cols-2 gap-3">
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
                      onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}
                    >
                      <option value="">— Vorlage auswählen —</option>
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Trigger */}
              <div className="grid grid-cols-2 gap-3">
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

              {/* Sender */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Absender-Name</label>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    placeholder="z. B. Max Muster"
                    value={form.sender_name}
                    onChange={(e) => setForm((f) => ({ ...f, sender_name: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Absender-E-Mail *</label>
                  <input
                    className={inputClass}
                    style={inputStyle}
                    type="email"
                    placeholder="noreply@beispiel.de"
                    value={form.sender_email}
                    onChange={(e) => setForm((f) => ({ ...f, sender_email: e.target.value }))}
                  />
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
                    — Variablen: #Kandidatenname, #Kampagnenname, #Kundenname, #Email, #Telefon
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
