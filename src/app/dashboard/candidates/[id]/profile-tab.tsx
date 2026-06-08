"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateCandidateProfileAction } from "./actions"

const STANDARD_FIELDS = new Set(["first_name", "last_name", "phone", "email"])

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

// Fields from campaign mapping that go into custom_fields (non-standard, non-empty)
function getMappingFields(mapping: Record<string, string> | null): string[] {
  if (!mapping) return []
  return [...new Set(
    Object.values(mapping).filter((internal) => internal && !STANDARD_FIELDS.has(internal))
  )]
}

interface ProfileTabProps {
  candidateId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  customFields: Record<string, string> | null
  campaignMapping: Record<string, string> | null
}

export function ProfileTab({
  candidateId,
  firstName,
  lastName,
  email,
  phone,
  customFields,
  campaignMapping,
}: ProfileTabProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editMode, setEditMode] = useState(false)

  const [localFirst, setLocalFirst] = useState(firstName)
  const [localLast, setLocalLast] = useState(lastName)
  const [localEmail, setLocalEmail] = useState(email ?? "")
  const [localPhone, setLocalPhone] = useState(phone ?? "")
  const [localCustom, setLocalCustom] = useState<Record<string, string>>(customFields ?? {})

  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")

  // Fields defined by the campaign mapping (stored in custom_fields)
  const mappingFields = getMappingFields(campaignMapping)
  const mappingFieldSet = new Set(mappingFields)

  // Extra fields: in custom_fields but not from campaign mapping
  const extraKeys = Object.keys(localCustom).filter((k) => !mappingFieldSet.has(k))

  function handleCancel() {
    setLocalFirst(firstName)
    setLocalLast(lastName)
    setLocalEmail(email ?? "")
    setLocalPhone(phone ?? "")
    setLocalCustom(customFields ?? {})
    setNewKey("")
    setNewValue("")
    setEditMode(false)
  }

  function handleAddField() {
    const key = newKey.trim()
    if (!key) return
    setLocalCustom((prev) => ({ ...prev, [key]: newValue }))
    setNewKey("")
    setNewValue("")
  }

  function handleSave() {
    startTransition(async () => {
      const fd = new FormData()
      fd.append("first_name", localFirst)
      fd.append("last_name", localLast)
      fd.append("email", localEmail)
      fd.append("phone", localPhone)
      fd.append("custom_fields_json", JSON.stringify(localCustom))
      await updateCandidateProfileAction(candidateId, fd)
      router.refresh()
      setEditMode(false)
    })
  }

  const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
  const inputStyle = { borderColor: "#dde3ea" }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-gray-400">Profil</span>
        {!editMode && (
          <button
            onClick={() => setEditMode(true)}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: "#1e56a0" }}
          >
            Bearbeiten
          </button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Stammdaten */}
        <fieldset className="rounded-xl border p-4" style={{ borderColor: "#dde3ea" }}>
          <legend className="px-1 text-xs font-semibold text-gray-400">Stammdaten</legend>
          <dl className="mt-1 flex flex-col gap-3">
            <FieldRow label="Vorname" editMode={editMode}>
              {editMode ? (
                <input className={inputClass} style={inputStyle} value={localFirst} onChange={(e) => setLocalFirst(e.target.value)} />
              ) : (localFirst || "—")}
            </FieldRow>
            <FieldRow label="Nachname" editMode={editMode}>
              {editMode ? (
                <input className={inputClass} style={inputStyle} value={localLast} onChange={(e) => setLocalLast(e.target.value)} />
              ) : (localLast || "—")}
            </FieldRow>
            <FieldRow label="E-Mail" editMode={editMode}>
              {editMode ? (
                <input className={inputClass} style={inputStyle} type="email" value={localEmail} onChange={(e) => setLocalEmail(e.target.value)} />
              ) : (localEmail || "—")}
            </FieldRow>
            <FieldRow label="Telefon" editMode={editMode}>
              {editMode ? (
                <input className={inputClass} style={inputStyle} type="tel" value={localPhone} onChange={(e) => setLocalPhone(e.target.value)} />
              ) : (localPhone || "—")}
            </FieldRow>
          </dl>
        </fieldset>

        {/* Zusatzfelder aus Kampagnen-Mapping */}
        <fieldset className="rounded-xl border p-4" style={{ borderColor: "#dde3ea" }}>
          <legend className="px-1 text-xs font-semibold text-gray-400">
            {campaignMapping ? "Zusatzfelder" : "Zusatzfelder (kein Kampagnen-Mapping)"}
          </legend>
          <dl className="mt-1 flex flex-col gap-3">
            {mappingFields.length === 0 && extraKeys.length === 0 && (
              <p className="text-sm text-gray-400">
                {campaignMapping
                  ? "Keine Zusatzfelder im Kampagnen-Mapping definiert."
                  : "Kein Kampagnen-Mapping vorhanden."}
              </p>
            )}

            {/* Felder aus Kampagnen-Mapping */}
            {mappingFields.map((key) => (
              <FieldRow key={key} label={formatLabel(key)} editMode={editMode}>
                {editMode ? (
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={localCustom[key] ?? ""}
                    onChange={(e) => setLocalCustom((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                ) : (localCustom[key] || "—")}
              </FieldRow>
            ))}

            {/* Manuell hinzugefügte Felder (nicht im Kampagnen-Mapping) */}
            {extraKeys.map((key) => (
              <FieldRow key={key} label={formatLabel(key)} editMode={editMode}>
                {editMode ? (
                  <input
                    className={inputClass}
                    style={inputStyle}
                    value={localCustom[key] ?? ""}
                    onChange={(e) => setLocalCustom((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                ) : (localCustom[key] || "—")}
              </FieldRow>
            ))}

            {/* Neues Feld hinzufügen (nur im Edit-Mode) */}
            {editMode && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Feldname"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                />
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Wert"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                />
                <button
                  type="button"
                  onClick={handleAddField}
                  className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-white"
                  style={{ backgroundColor: "#4ba3c3" }}
                >
                  +
                </button>
              </div>
            )}
          </dl>
        </fieldset>
      </div>

      {editMode && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={pending}
            className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {pending ? "Wird gespeichert…" : "Änderungen speichern"}
          </button>
          <button
            onClick={handleCancel}
            disabled={pending}
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            style={{ borderColor: "#dde3ea" }}
          >
            Abbrechen
          </button>
        </div>
      )}
    </div>
  )
}

function FieldRow({
  label,
  editMode,
  children,
}: {
  label: string
  editMode: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex ${editMode ? "flex-col gap-1" : "items-start gap-2"}`}>
      <dt
        className="shrink-0 text-sm text-gray-500"
        style={{ minWidth: editMode ? undefined : "9rem" }}
      >
        {label}
      </dt>
      <dd className={`text-sm text-gray-900 ${editMode ? "w-full" : ""}`}>{children}</dd>
    </div>
  )
}
