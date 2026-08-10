"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { FIXED_CUSTOM_FIELDS, FIXED_CUSTOM_FIELD_KEYS, WEITERE_ANTWORTEN_KEY } from "@/lib/candidate-custom-fields"
import { updateCandidateProfileAction, updateCandidateCustomFieldAction } from "./actions"

function formatLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
}

interface ProfileTabProps {
  candidateId: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  berufsbild: string | null
  plz: string | null
  customFields: Record<string, string> | null
}

export function ProfileTab({
  candidateId,
  firstName,
  lastName,
  email,
  phone,
  berufsbild,
  plz,
  customFields,
}: ProfileTabProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editMode, setEditMode] = useState(false)

  const [localFirst, setLocalFirst] = useState(firstName)
  const [localLast, setLocalLast] = useState(lastName)
  const [localEmail, setLocalEmail] = useState(email ?? "")
  const [localPhone, setLocalPhone] = useState(phone ?? "")
  const [localBerufsbild, setLocalBerufsbild] = useState(berufsbild ?? "")
  const [localPlz, setLocalPlz] = useState(plz ?? "")
  const [localCustom, setLocalCustom] = useState<Record<string, string>>(customFields ?? {})

  const [newKey, setNewKey] = useState("")
  const [newValue, setNewValue] = useState("")

  // Keys in custom_fields, die nicht zum festen 12-Felder-Satz gehören (z.B. aus
  // älteren Imports) — werden weiterhin angezeigt und nicht stillschweigend gelöscht.
  // WEITERE_ANTWORTEN_KEY ist ausgenommen: der hat einen eigenen, mehrzeiligen
  // Anzeige-Block im Verlauf-Tab (siehe history-tab.tsx) statt hier als einzeiliges
  // Eingabefeld zu doppeln.
  const extraKeys = Object.keys(localCustom).filter(
    (k) => !FIXED_CUSTOM_FIELD_KEYS.has(k) && k !== WEITERE_ANTWORTEN_KEY
  )

  function handleCustomFieldSaved(key: string, value: string) {
    setLocalCustom((prev) => {
      const next = { ...prev }
      if (value === "") delete next[key]
      else next[key] = value
      return next
    })
  }

  function handleCancel() {
    setLocalFirst(firstName)
    setLocalLast(lastName)
    setLocalEmail(email ?? "")
    setLocalPhone(phone ?? "")
    setLocalBerufsbild(berufsbild ?? "")
    setLocalPlz(plz ?? "")
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
      fd.append("berufsbild", localBerufsbild)
      fd.append("plz", localPlz)
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
            <FieldRow label="Berufsbild" editMode={editMode}>
              {editMode ? (
                <select
                  className={inputClass}
                  style={inputStyle}
                  value={localBerufsbild}
                  onChange={(e) => setLocalBerufsbild(e.target.value)}
                >
                  <option value="">Kein Berufsbild</option>
                  {BERUFSBILD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (BERUFSBILD_OPTIONS.find((o) => o.value === localBerufsbild)?.label || "—")}
            </FieldRow>
            <FieldRow label="PLZ" editMode={editMode}>
              {editMode ? (
                <input className={inputClass} style={inputStyle} value={localPlz} onChange={(e) => setLocalPlz(e.target.value)} maxLength={5} inputMode="numeric" />
              ) : (localPlz || "—")}
            </FieldRow>
          </dl>
        </fieldset>

        {/* Zusatzfelder */}
        <fieldset className="rounded-xl border p-4" style={{ borderColor: "#dde3ea" }}>
          <legend className="px-1 text-xs font-semibold text-gray-400">Zusatzfelder</legend>
          <dl className="mt-1 flex flex-col gap-3">
            {/* Fester Satz von 12 Feldern — immer in dieser Reihenfolge, direkt inline editierbar */}
            {FIXED_CUSTOM_FIELDS.map(({ key, label }) => (
              <CustomFieldRow
                key={key}
                candidateId={candidateId}
                fieldKey={key}
                label={label}
                value={localCustom[key] ?? ""}
                onSaved={handleCustomFieldSaved}
              />
            ))}

            {/* Extra Keys: in custom_fields, aber nicht im festen Satz (z.B. ältere Imports) */}
            {extraKeys.length > 0 && (
              <div className="mt-1 border-t pt-3" style={{ borderColor: "#dde3ea" }}>
                <span className="text-xs font-medium text-gray-400">Weitere Felder</span>
              </div>
            )}
            {extraKeys.map((key) => (
              <FieldRow key={key} label={formatLabel(key)} editMode={editMode} stacked>
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

function CustomFieldRow({
  candidateId,
  fieldKey,
  label,
  value,
  onSaved,
}: {
  candidateId: string
  fieldKey: string
  label: string
  value: string
  onSaved: (key: string, value: string) => void
}) {
  const router = useRouter()
  const [localValue, setLocalValue] = useState(value)
  const [pending, startTransition] = useTransition()
  const savedValueRef = useRef(value)

  function handleBlur() {
    const trimmed = localValue.trim()
    if (trimmed === savedValueRef.current) {
      setLocalValue(trimmed)
      return
    }
    startTransition(async () => {
      await updateCandidateCustomFieldAction(candidateId, fieldKey, trimmed)
      savedValueRef.current = trimmed
      setLocalValue(trimmed)
      onSaved(fieldKey, trimmed)
      router.refresh()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.currentTarget.blur()
    }
  }

  return (
    <FieldRow label={label} editMode stacked>
      <input
        className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-50"
        style={{ borderColor: "#dde3ea" }}
        value={localValue}
        placeholder="Hier eingeben"
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={pending}
      />
    </FieldRow>
  )
}

function FieldRow({
  label,
  editMode,
  stacked = false,
  children,
}: {
  label: string
  editMode: boolean
  stacked?: boolean
  children: React.ReactNode
}) {
  const useStack = stacked || editMode
  return (
    <div className={`flex ${useStack ? "flex-col gap-1" : "items-start gap-2"}`}>
      <dt
        className={useStack ? "text-xs font-medium text-gray-400" : "shrink-0 text-sm text-gray-500"}
        style={{ minWidth: useStack ? undefined : "9rem" }}
      >
        {label}
      </dt>
      <dd className={`text-sm text-gray-900 ${useStack ? "w-full" : ""}`}>{children}</dd>
    </div>
  )
}
