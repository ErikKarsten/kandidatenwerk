"use client"

import { useState, useTransition, useEffect } from "react"
import { useRouter } from "next/navigation"
import { updateCampaignSettingsAction } from "./actions"

const CANDIDATE_STATUSES = [
  { value: "neu", label: "Neu", bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  { value: "interview", label: "Interview", bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  { value: "vorgestellt", label: "Vorgestellt", bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  { value: "platziert", label: "Platziert", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
]

const TEMPLATES: Record<string, { label: string; fields: string[] }> = {
  steuerfachangestellte: {
    label: "Steuerfachangestellte (Standard)",
    fields: [
      "full_name",
      "email",
      "phone_number",
      "welche_ausbildung_hast_du_absolviert",
      "wann_können_wir_dich_erreichen",
      "Startdatum",
      "Wechselgrund",
      "Was erwartest du vom neuen AG",
      "Welchen Bereich machst du am liebsten",
      "Wie viele AG in den letzten 5 Jahren",
      "Aktuell in Steuerkanzlei",
      "Wie groß ist diese",
      "Welche Branchen werden dort betreut",
      "Erfahrung mit DATEV",
      "Alter & Wohnort",
    ],
  },
}

const DEFAULT_FIELDS = TEMPLATES.steuerfachangestellte.fields

function buildInitialFields(saved: string[] | null): string[] {
  if (Array.isArray(saved) && saved.length > 0) return saved
  return [...DEFAULT_FIELDS]
}

interface SettingsTabProps {
  campaignId: string
  metaFormId: string | null
  metaFieldMapping: string[] | null
}

export function SettingsTab({ campaignId, metaFormId, metaFieldMapping }: SettingsTabProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [localFormId, setLocalFormId] = useState(metaFormId ?? "")
  const [fields, setFields] = useState<string[]>(() => buildInitialFields(metaFieldMapping))
  const [newField, setNewField] = useState("")

  // Auto-save default template on first load when no mapping is set yet
  useEffect(() => {
    const isEmpty = !Array.isArray(metaFieldMapping) || metaFieldMapping.length === 0
    if (!isEmpty) return
    const fd = new FormData()
    fd.append("meta_form_id", metaFormId ?? "")
    fd.append("meta_field_mapping_json", JSON.stringify(DEFAULT_FIELDS))
    startTransition(async () => {
      await updateCampaignSettingsAction(campaignId, fd)
      router.refresh()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function updateField(index: number, value: string) {
    setFields((prev) => prev.map((f, i) => (i === index ? value : f)))
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  function addField() {
    const key = newField.trim()
    if (!key) return
    setFields((prev) => [...prev, key])
    setNewField("")
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const fd = new FormData()
    fd.append("meta_form_id", localFormId)
    fd.append("meta_field_mapping_json", JSON.stringify(fields.filter(Boolean)))
    startTransition(async () => {
      const result = await updateCampaignSettingsAction(campaignId, fd)
      if (result?.error) {
        setError(result.error)
      } else {
        setSaved(true)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-8">

      {/* Status-Felder */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Status-Felder</h3>
        <p className="mb-3 text-xs text-gray-400">Pipeline-Stufen für Kandidaten in dieser Kampagne</p>
        <div className="flex flex-wrap gap-2">
          {CANDIDATE_STATUSES.map((s) => (
            <span
              key={s.value}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
              style={{ backgroundColor: s.bg, color: s.text }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
              {s.label}
            </span>
          ))}
        </div>
      </section>

      <div className="h-px" style={{ backgroundColor: "#dde3ea" }} />

      {/* Meta Form ID */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Meta Lead Form</h3>
        <p className="mb-3 text-xs text-gray-400">ID des Meta-Formulars, aus dem Leads importiert werden</p>
        <div className="flex max-w-sm flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-500">Meta Form ID</label>
          <input
            value={localFormId}
            onChange={(e) => setLocalFormId(e.target.value)}
            placeholder="z.B. 1234567890"
            className="rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1"
            style={{ borderColor: "#dde3ea" }}
          />
        </div>
      </section>

      <div className="h-px" style={{ backgroundColor: "#dde3ea" }} />

      {/* Field Mapping */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Felder</h3>
        <p className="mb-3 text-xs text-gray-400">
          Feldnamen aus dem Meta-Formular. Diese werden 1:1 als Keys in{" "}
          <span className="font-mono">custom_fields</span> des Kandidaten gespeichert.
        </p>

        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500 shrink-0">Vorlage laden</label>
          <select
            defaultValue=""
            onChange={(e) => {
              const tpl = TEMPLATES[e.target.value]
              if (tpl) setFields([...tpl.fields])
              e.target.value = ""
            }}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
            style={{ borderColor: "#dde3ea" }}
          >
            <option value="" disabled>Vorlage auswählen…</option>
            {Object.entries(TEMPLATES).map(([key, tpl]) => (
              <option key={key} value={key}>{tpl.label}</option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #dde3ea" }}>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Feldname</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {fields.map((field, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: i < fields.length - 1 ? "1px solid #dde3ea" : undefined }}
                >
                  <td className="px-4 py-2">
                    <input
                      value={field}
                      onChange={(e) => updateField(i, e.target.value)}
                      placeholder="feldname"
                      className="w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1"
                      style={{ borderColor: "#dde3ea" }}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeField(i)}
                      className="rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Feld entfernen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t px-4 py-2.5 flex items-center gap-2" style={{ borderColor: "#dde3ea" }}>
            <input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addField() } }}
              placeholder="Neues Feld…"
              className="flex-1 rounded border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea" }}
            />
            <button
              onClick={addField}
              className="shrink-0 rounded px-2 py-1.5 text-xs font-medium text-white"
              style={{ backgroundColor: "#4ba3c3" }}
            >
              + Hinzufügen
            </button>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Einstellungen gespeichert.
        </p>
      )}

      <div>
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {pending ? "Wird gespeichert…" : "Einstellungen speichern"}
        </button>
      </div>
    </div>
  )
}
