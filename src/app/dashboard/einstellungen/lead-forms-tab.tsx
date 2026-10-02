"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react"
import { saveLeadFormMappingAction, syncLeadFormsNowAction, type LeadFormOverview } from "./field-actions"
import type { CustomFieldDefinition } from "./actions"
import { CORE_TARGETS, SPECIAL_TARGETS } from "@/lib/lead-form-targets"

// Einstellungen -> Lead-Formulare (Paket 8): alle Meta-Formulare der laufenden
// Lead-Kampagnen mit der Zuordnung jeder Frage zu einem Kandidatenfeld. Neue Formulare
// erkennt der stündliche Meta-Abgleich; Fragen bekommen automatisch einen Vorschlag.
export function LeadFormsTab({ forms, fields, isAdmin }: { forms: LeadFormOverview[]; fields: CustomFieldDefinition[]; isAdmin: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [showUnused, setShowUnused] = useState(false)

  const visible = showUnused ? forms : forms.filter((f) => f.campaigns.length > 0)

  function handleSync() {
    setMessage(null)
    startTransition(async () => {
      const result = await syncLeadFormsNowAction()
      if ("error" in result) return setMessage({ ok: false, text: result.error })
      const base = `${result.forms} Formulare eingelesen, ${result.added} neu, ${result.newQuestions} neue Fragen.`
      setMessage(result.errors.length > 0 ? { ok: false, text: `${base} Hinweise: ${result.errors.join(" · ")}` } : { ok: true, text: base })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Lead-Formulare</h2>
            <p className="mt-1 max-w-2xl text-xs text-gray-500">
              Für jedes Meta-Formular legst du fest, in welches Kandidatenfeld die Antwort auf jede Frage kommt. Neue
              Formulare erkennt Kandidatenwerk beim stündlichen Meta-Abgleich und schlägt eine Zuordnung vor. Antworten ohne
              passendes Feld landen in der Beschreibung des Kandidaten.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={handleSync}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              <RefreshCw size={13} className={pending ? "animate-spin" : undefined} />
              {pending ? "Liest ein…" : "Formulare von Meta einlesen"}
            </button>
          )}
        </div>
        {message && (
          <p className="mt-2 text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>
            {message.text}
          </p>
        )}
        <label className="mt-3 flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={showUnused} onChange={(e) => setShowUnused(e.target.checked)} />
          Auch Formulare ohne laufende Kampagne anzeigen ({forms.filter((f) => f.campaigns.length === 0).length})
        </label>
      </div>

      {visible.length === 0 && <p className="text-sm text-gray-400">Keine Formulare.</p>}
      {visible.map((form) => (
        <FormCard key={form.formId} form={form} fields={fields} isAdmin={isAdmin} />
      ))}
    </div>
  )
}

function FormCard({ form, fields, isAdmin }: { form: LeadFormOverview; fields: CustomFieldDefinition[]; isAdmin: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  // Nur eigene Änderungen merken - sonst gilt der gespeicherte Stand (der sich nach
  // dem Einlesen oder Speichern ändert).
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const targets: Record<string, string> = Object.fromEntries(form.questions.map((q) => [q.key, overrides[q.key] ?? q.target]))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = form.questions.some((q) => targets[q.key] !== q.target)
  const status = form.questions.length === 0 ? "nicht eingelesen" : form.reviewedAt ? "geprüft" : "Vorschlag, ungeprüft"
  const statusColor = form.questions.length === 0 ? "#6b7280" : form.reviewedAt ? "#1a9a6a" : "#b45309"

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await saveLeadFormMappingAction(form.formId, targets)
      if (result?.error) return setError(result.error)
      setOverrides({})
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: "#dde3ea" }}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="mt-0.5 text-gray-400">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900">{form.name ?? `Formular ${form.formId}`}</span>
          <span className="block truncate text-xs text-gray-500">
            {form.pageName ? `Seite ${form.pageName} · ` : ""}
            {form.campaigns.length > 0 ? `${form.campaigns.length} laufende Kampagne${form.campaigns.length === 1 ? "" : "n"}` : "keine laufende Kampagne"}
            {form.questions.length > 0 ? ` · ${form.questions.length} Fragen` : ""}
          </span>
        </span>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
          {status}
        </span>
      </button>

      {open && (
        <div className="border-t px-4 pb-4 pt-3" style={{ borderColor: "#eef2f6" }}>
          {form.campaigns.length > 0 && (
            <p className="mb-3 text-xs text-gray-500">
              Genutzt von:{" "}
              {form.campaigns.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/dashboard/campaigns/${c.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                    {c.title}
                  </Link>
                </span>
              ))}
            </p>
          )}
          {form.questions.length === 0 ? (
            <p className="text-sm text-gray-400">
              Fragen noch nicht eingelesen. „Formulare von Meta einlesen“ klicken – klappt das nicht, ist die Facebook-Seite des
              Formulars dem Meta-Systemnutzer nicht freigegeben. Sobald Leads eingehen, erscheinen die Fragen auch von selbst.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                    <th className="py-2 pr-3 font-medium">Frage im Formular</th>
                    <th className="py-2 font-medium">Kandidatenfeld</th>
                  </tr>
                </thead>
                <tbody>
                  {form.questions.map((q) => (
                    <tr key={q.key} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                      <td className="py-2 pr-3">
                        <span className="text-gray-800">{q.label}</span>
                        {q.type !== "CUSTOM" && <span className="ml-2 text-xs text-gray-400">{q.type}</span>}
                      </td>
                      <td className="py-2">
                        <select
                          value={targets[q.key] ?? "beschreibung"}
                          onChange={(e) => setOverrides({ ...overrides, [q.key]: e.target.value })}
                          disabled={!isAdmin}
                          className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                          style={{ borderColor: targets[q.key] !== q.target ? "#1e56a0" : "#dde3ea" }}
                        >
                          <optgroup label="Stammdaten">
                            {CORE_TARGETS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                            {fields
                              .filter((f) => f.section === "stammdaten")
                              .map((f) => (
                                <option key={f.key} value={`field:${f.key}`}>
                                  {f.label}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="Zusatzfelder">
                            {fields
                              .filter((f) => f.section !== "stammdaten")
                              .map((f) => (
                                <option key={f.key} value={`field:${f.key}`}>
                                  {f.label}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="Sonstiges">
                            {SPECIAL_TARGETS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {isAdmin && form.questions.length > 0 && (
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={pending}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                style={{ backgroundColor: "#1e56a0" }}
              >
                {pending ? "Speichert…" : form.reviewedAt && !dirty ? "Erneut bestätigen" : "Zuordnung speichern"}
              </button>
              {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
