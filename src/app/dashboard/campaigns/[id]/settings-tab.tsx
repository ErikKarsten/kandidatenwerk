"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateCampaignSettingsAction } from "./actions"

const CANDIDATE_STATUSES = [
  { value: "neu", label: "Neu", bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  { value: "interview", label: "Interview", bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  { value: "vorgestellt", label: "Vorgestellt", bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  { value: "platziert", label: "Platziert", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
]

const DEFAULT_ROWS = [
  { meta_field: "full_name", internal: "first_name" },
  { meta_field: "phone_number", internal: "phone" },
  { meta_field: "email", internal: "email" },
  { meta_field: "welche_ausbildung_hast_du_absolviert", internal: "ausbildung" },
  { meta_field: "wann_können_wir_dich_erreichen", internal: "erreichbarkeit" },
]

type MappingRow = { meta_field: string; internal: string }

function buildInitialMapping(saved: Record<string, string> | null): MappingRow[] {
  if (saved && Object.keys(saved).length > 0) {
    return Object.entries(saved).map(([meta_field, internal]) => ({ meta_field, internal }))
  }
  return DEFAULT_ROWS.map((r) => ({ ...r }))
}

interface SettingsTabProps {
  campaignId: string
  metaFormId: string | null
  metaFieldMapping: Record<string, string> | null
}

export function SettingsTab({ campaignId, metaFormId, metaFieldMapping }: SettingsTabProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [localFormId, setLocalFormId] = useState(metaFormId ?? "")
  const [mapping, setMapping] = useState<MappingRow[]>(() => buildInitialMapping(metaFieldMapping))

  function updateRow(index: number, field: "meta_field" | "internal", value: string) {
    setMapping((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  function removeRow(index: number) {
    setMapping((prev) => prev.filter((_, i) => i !== index))
  }

  function addRow() {
    setMapping((prev) => [...prev, { meta_field: "", internal: "" }])
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const mappingObj: Record<string, string> = {}
    for (const row of mapping) {
      const key = row.meta_field.trim()
      if (key) mappingObj[key] = row.internal.trim()
    }
    const fd = new FormData()
    fd.append("meta_form_id", localFormId)
    fd.append("meta_field_mapping_json", JSON.stringify(mappingObj))
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
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Field Mapping</h3>
        <p className="mb-3 text-xs text-gray-400">
          Meta-Feld → Internes Feld. Beim Lead-Import werden diese Felder automatisch in{" "}
          <span className="font-mono">custom_fields</span> des Kandidaten gemappt.
        </p>

        <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #dde3ea" }}>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Meta-Feld</th>
                <th className="w-8 px-2 py-2.5 text-center text-xs text-gray-400">→</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Internes Feld</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {mapping.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: i < mapping.length - 1 ? "1px solid #dde3ea" : undefined }}
                >
                  <td className="px-4 py-2">
                    <input
                      value={row.meta_field}
                      onChange={(e) => updateRow(i, "meta_field", e.target.value)}
                      placeholder="meta_feld_name"
                      className="w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1"
                      style={{ borderColor: "#dde3ea" }}
                    />
                  </td>
                  <td className="px-2 py-2 text-center text-xs text-gray-400">→</td>
                  <td className="px-4 py-2">
                    <input
                      value={row.internal}
                      onChange={(e) => updateRow(i, "internal", e.target.value)}
                      placeholder="internes_feld"
                      className="w-full rounded border px-2 py-1.5 font-mono text-xs focus:outline-none focus:ring-1"
                      style={{ borderColor: "#dde3ea" }}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="rounded px-1.5 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      title="Zeile entfernen"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t px-4 py-2.5" style={{ borderColor: "#dde3ea" }}>
            <button
              onClick={addRow}
              className="text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: "#1e56a0" }}
            >
              + Feld hinzufügen
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
