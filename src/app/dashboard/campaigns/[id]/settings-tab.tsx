"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { updateCampaignSettingsAction, listMetaPagesAction, listMetaLeadFormsAction, requestMetaTestLeadAction } from "./actions"
import type { MetaPage, MetaLeadForm } from "@/lib/meta-ads-client"

interface SettingsTabProps {
  campaignId: string
  metaFormId: string | null
  // Nicht mehr genutzt seit dem Umstieg auf die KI-gestützte Zusatzfelder-Extraktion
  // (scripts/meta-leads-sync.ts, wie beim Leadtable-Sync) - Prop bleibt aus
  // Kompatibilitätsgründen bestehen (campaign-detail.tsx reicht sie weiterhin durch),
  // wird hier aber nicht mehr angezeigt oder gespeichert.
  metaFieldMapping: string[] | null
  berufsbild: string | null
  plz: string | null
  radiusKm: number | null
}

export function SettingsTab({ campaignId, metaFormId, berufsbild, plz, radiusKm }: SettingsTabProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [localFormId, setLocalFormId] = useState(metaFormId ?? "")
  const [localBerufsbild, setLocalBerufsbild] = useState(berufsbild ?? "")
  const [localPlz, setLocalPlz] = useState(plz ?? "")
  const [localRadiusKm, setLocalRadiusKm] = useState(String(radiusKm ?? 25))

  // Seite-/Formular-Auswähler fürs Meta-Lead-Form-Feld, analog zum
  // Leadtable-Direktintegrations-Dialog (erst Seite, dann Formular dieser Seite
  // wählen, statt eine rohe Formular-ID von Hand einzutippen). selectedFormLabel
  // ist nur der schön lesbare Name des per Auswähler frisch gewählten Formulars -
  // ein bereits vorher (z.B. manuell) gesetzter Wert hat den nicht und zeigt
  // stattdessen nur die rohe ID, bis er über den Auswähler neu gesetzt wird.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const [selectedFormLabel, setSelectedFormLabel] = useState<string | null>(null)
  const [pages, setPages] = useState<MetaPage[] | null>(null)
  const [pagesPending, startPagesTransition] = useTransition()
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [selectedPageId, setSelectedPageId] = useState("")
  const [forms, setForms] = useState<MetaLeadForm[] | null>(null)
  const [formsPending, startFormsTransition] = useTransition()
  const [formsError, setFormsError] = useState<string | null>(null)
  // Testlead-Button steht nur zur Verfügung, solange die Seiten-ID aus dieser
  // Browser-Session bekannt ist (frisch über den Auswähler gewählt) - bei einem
  // schon vorher gespeicherten Formular fehlt sie, siehe requestMetaTestLeadAction.
  const [testLeadPending, startTestLeadTransition] = useTransition()
  const [testLeadMessage, setTestLeadMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  function openPicker() {
    setPickerOpen(true)
    setManualEntry(false)
    if (pages === null) {
      setPagesError(null)
      startPagesTransition(async () => {
        const result = await listMetaPagesAction()
        if (result.success) setPages(result.pages)
        else setPagesError(result.error)
      })
    }
  }

  function handlePageChange(pageId: string) {
    setSelectedPageId(pageId)
    setForms(null)
    setFormsError(null)
    if (!pageId) return
    startFormsTransition(async () => {
      const result = await listMetaLeadFormsAction(pageId)
      if (result.success) setForms(result.forms)
      else setFormsError(result.error)
    })
  }

  function handleFormSelect(form: MetaLeadForm) {
    setLocalFormId(form.id)
    setSelectedFormLabel(form.name)
    setPickerOpen(false)
    setTestLeadMessage(null)
  }

  function handleRequestTestLead() {
    if (!selectedPageId || !localFormId) return
    setTestLeadMessage(null)
    startTestLeadTransition(async () => {
      const result = await requestMetaTestLeadAction(selectedPageId, localFormId)
      if (result.success) {
        setTestLeadMessage({
          type: "success",
          text: `Testlead angefordert (${result.leadId}). Kann jetzt per Sync-Skript abgerufen werden.`,
        })
      } else {
        setTestLeadMessage({ type: "error", text: result.error })
      }
    })
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    const fd = new FormData()
    fd.append("meta_form_id", localFormId)
    // Zusatzfelder werden jetzt automatisch per KI aus den Meta-Formular-Antworten
    // befüllt (siehe scripts/meta-leads-sync.ts) - keine manuelle Feldliste mehr nötig.
    fd.append("meta_field_mapping_json", "[]")
    fd.append("berufsbild", localBerufsbild)
    fd.append("plz", localPlz)
    fd.append("radius_km", localRadiusKm)
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
          {CANDIDATE_STATUS_OPTIONS.map((s) => (
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

      {/* Matching */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Matching</h3>
        <p className="mb-3 text-xs text-gray-400">Beruf und Standort für automatisches Matching mit Kandidaten</p>
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">Berufsbild</label>
            <select
              value={localBerufsbild}
              onChange={(e) => setLocalBerufsbild(e.target.value)}
              className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
            >
              <option value="">Kein Berufsbild</option>
              {BERUFSBILD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">PLZ</label>
              <input
                value={localPlz}
                onChange={(e) => setLocalPlz(e.target.value)}
                placeholder="10115"
                maxLength={5}
                inputMode="numeric"
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: "#dde3ea" }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">Umkreis (km)</label>
              <input
                type="number"
                value={localRadiusKm}
                onChange={(e) => setLocalRadiusKm(e.target.value)}
                placeholder="25"
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: "#dde3ea" }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="h-px" style={{ backgroundColor: "#dde3ea" }} />

      {/* Meta Form ID */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Meta Lead Form</h3>
        <p className="mb-3 text-xs text-gray-400">
          Seite und Formular auswählen, aus dem Leads importiert werden. Die
          Formular-Antworten werden automatisch per KI den passenden
          Kandidaten-Zusatzfeldern zugeordnet - keine manuelle Feldkonfiguration nötig.
        </p>

        {!pickerOpen && !manualEntry && (
          <div className="flex max-w-sm flex-col gap-2">
            {localFormId ? (
              <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2" style={{ borderColor: "#dde3ea" }}>
                <span className="text-xs font-medium text-gray-500">Aktuelles Formular</span>
                <span className="text-sm text-gray-700">{selectedFormLabel ?? "Bereits hinterlegt"}</span>
                <code className="text-xs text-gray-400">{localFormId}</code>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Noch kein Formular ausgewählt.</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={openPicker}
                className="w-fit text-xs font-medium hover:underline"
                style={{ color: "#1e56a0" }}
              >
                {localFormId ? "Formular ändern" : "Formular auswählen"}
              </button>
              <button
                type="button"
                onClick={() => setManualEntry(true)}
                className="w-fit text-xs text-gray-400 hover:underline"
              >
                ID manuell eingeben
              </button>
              {selectedPageId && localFormId && (
                <button
                  type="button"
                  onClick={handleRequestTestLead}
                  disabled={testLeadPending}
                  className="w-fit text-xs font-medium hover:underline disabled:opacity-50"
                  style={{ color: "#1e56a0" }}
                >
                  {testLeadPending ? "Wird angefordert…" : "Testlead anfordern"}
                </button>
              )}
            </div>
            {!selectedPageId && localFormId && (
              <p className="text-xs text-gray-400">
                Um einen Testlead anzufordern, Formular einmal über &quot;Formular ändern&quot; neu auswählen.
              </p>
            )}
            {testLeadMessage && (
              <p
                className="text-xs"
                style={{ color: testLeadMessage.type === "success" ? "#1a9a6a" : "#dc2626" }}
              >
                {testLeadMessage.text}
              </p>
            )}
          </div>
        )}

        {manualEntry && (
          <div className="flex max-w-sm flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-500">Meta Form ID</label>
            <input
              value={localFormId}
              onChange={(e) => { setLocalFormId(e.target.value); setSelectedFormLabel(null) }}
              placeholder="z.B. 1234567890"
              className="rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea" }}
            />
            <button
              type="button"
              onClick={() => setManualEntry(false)}
              className="w-fit text-xs font-medium hover:underline"
              style={{ color: "#1e56a0" }}
            >
              Stattdessen aus Liste wählen
            </button>
          </div>
        )}

        {pickerOpen && (
          <div className="flex max-w-sm flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">Seite</label>
              <select
                value={selectedPageId}
                onChange={(e) => handlePageChange(e.target.value)}
                disabled={pagesPending || pages === null}
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
              >
                <option value="" disabled>
                  {pagesPending ? "Seiten werden geladen…" : "Seite auswählen…"}
                </option>
                {pages?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {pagesError && <p className="text-xs text-red-600">{pagesError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">Formular</label>
              <select
                value=""
                onChange={(e) => {
                  const form = forms?.find((f) => f.id === e.target.value)
                  if (form) handleFormSelect(form)
                }}
                disabled={!selectedPageId || formsPending || forms === null}
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
              >
                <option value="" disabled>
                  {!selectedPageId
                    ? "Erst Seite wählen"
                    : formsPending
                      ? "Formulare werden geladen…"
                      : forms?.length === 0
                        ? "Keine Formulare gefunden"
                        : "Formular auswählen…"}
                </option>
                {forms?.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              {formsError && <p className="text-xs text-red-600">{formsError}</p>}
            </div>

            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="w-fit text-xs text-gray-400 hover:underline"
            >
              Abbrechen
            </button>
          </div>
        )}
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
