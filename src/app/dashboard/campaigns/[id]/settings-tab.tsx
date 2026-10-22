"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { updateCampaignSettingsAction, listMetaPagesAction, listMetaLeadFormsAction, listOwnMetaCampaignsAction, requestMetaTestLeadAction } from "./actions"
import type { MetaPage, MetaLeadForm } from "@/lib/meta-ads-client"
import type { OwnMetaCampaign } from "@/lib/meta-own-campaigns"
import { isSelectableForm } from "@/lib/meta-campaigns-parse"
import { SearchableSelect } from "@/components/ui/searchable-select"
import { RadiusControl } from "@/components/ui/radius-control"

interface SettingsTabProps {
  campaignId: string
  metaFormId: string | null
  metaFormName: string | null
  // Nicht mehr genutzt seit dem Umstieg auf die KI-gestützte Zusatzfelder-Extraktion
  // (scripts/meta-leads-sync.ts, wie beim Leadtable-Sync) - Prop bleibt aus
  // Kompatibilitätsgründen bestehen (campaign-detail.tsx reicht sie weiterhin durch),
  // wird hier aber nicht mehr angezeigt oder gespeichert.
  metaFieldMapping: string[] | null
  berufsbild: string | null
  plz: string | null
  radiusKm: number | null
  // Weitere Standorte (PLZ) aus zusammengeführten Stellen (Paket 40).
  extraPlz?: string[]
  // Zeitpunkt der letzten per Webhook BESTAETIGTEN Verbindung (siehe
  // isMetaTestLead/handleLeadgenEvent) - unabhaengig von testLeadMessage unten, die nur
  // zeigt, dass die Anfrage bei Meta erfolgreich RAUSGEGANGEN ist, nicht dass sie
  // tatsaechlich zugestellt wurde.
  metaWebhookLastTestAt: string | null
  // Kanzlei-Kampagnen: Feld-Vorlage statt Meta-Formular (Paket 8) - Leads kommen nur
  // noch über Lead-Kampagnen.
  kind: string
  // Keine Eingangsbestätigung an Leads dieser Kampagne (Paket 80).
  skipLeadConfirmation?: boolean
  fieldTemplateId: string | null
  fieldTemplates: { id: string; name: string; is_default: boolean }[]
}

export function SettingsTab({ campaignId, metaFormId, metaFormName, berufsbild, plz, radiusKm, extraPlz, metaWebhookLastTestAt, kind, skipLeadConfirmation = false, fieldTemplateId, fieldTemplates }: SettingsTabProps) {
  const bb = useBerufsbilder()
  const isKanzlei = kind === "kanzlei"
  const [localTemplateId, setLocalTemplateId] = useState(fieldTemplateId ?? "")
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [localFormId, setLocalFormId] = useState(metaFormId ?? "")
  const [localBerufsbild, setLocalBerufsbild] = useState(berufsbild ?? "")
  const [localPlz, setLocalPlz] = useState(plz ?? "")
  const [localRadiusKm, setLocalRadiusKm] = useState(String(radiusKm ?? 25))
  const [localExtraPlz, setLocalExtraPlz] = useState((extraPlz ?? []).join(", "))

  // Seite-/Formular-Auswähler fürs Meta-Lead-Form-Feld, analog zum
  // Leadtable-Direktintegrations-Dialog (erst Seite, dann Formular dieser Seite
  // wählen, statt eine rohe Formular-ID von Hand einzutippen). selectedFormLabel
  // ist der lesbare Name des aktuell verknüpften Formulars - initial aus der DB
  // (meta_form_name, bleibt so auch nach einem Seiten-Reload erhalten), wird beim
  // frischen Auswählen im Picker überschrieben. Bei manueller ID-Eingabe explizit
  // auf null gesetzt, damit nie ein (dann evtl. falscher) Name zu einer von Hand
  // eingetragenen ID angezeigt wird.
  const [pickerOpen, setPickerOpen] = useState(false)
  const [manualEntry, setManualEntry] = useState(false)
  const [selectedFormLabel, setSelectedFormLabel] = useState<string | null>(metaFormName ?? null)
  const [pages, setPages] = useState<MetaPage[] | null>(null)
  const [pagesPending, startPagesTransition] = useTransition()
  const [pagesError, setPagesError] = useState<string | null>(null)
  const [selectedPageId, setSelectedPageId] = useState("")
  const [forms, setForms] = useState<MetaLeadForm[] | null>(null)
  const [formsPending, startFormsTransition] = useTransition()
  const [formsError, setFormsError] = useState<string | null>(null)
  // Kanzlei-Kampagnen (Paket 80): Formular einer eigenen Meta-Kampagne der Kanzlei.
  const [ownCampaigns, setOwnCampaigns] = useState<OwnMetaCampaign[] | null>(null)
  const [ownOpen, setOwnOpen] = useState(false)
  const [ownPending, startOwnTransition] = useTransition()
  const [ownError, setOwnError] = useState<string | null>(null)
  const [ownQuery, setOwnQuery] = useState("")
  const [localSkipConfirmation, setLocalSkipConfirmation] = useState(skipLeadConfirmation)
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

  function openOwnPicker() {
    setOwnOpen(true)
    if (ownCampaigns !== null) return
    setOwnError(null)
    startOwnTransition(async () => {
      const result = await listOwnMetaCampaignsAction()
      if (result.success) setOwnCampaigns(result.campaigns)
      else setOwnError(result.error)
    })
  }

  function handleOwnFormSelect(campaignName: string, formId: string, formName: string | null) {
    // Erstes Formular verknüpft: Eingangsbestätigung standardmäßig aus - die Bewerber haben
    // sich bei der Kanzlei beworben, nicht bei KS24.
    if (!localFormId) setLocalSkipConfirmation(true)
    setLocalFormId(formId)
    setSelectedFormLabel(`${formName ?? `Formular ${formId}`} · ${campaignName}`)
    setOwnOpen(false)
    setTestLeadMessage(null)
  }

  function handleFormSelect(form: MetaLeadForm) {
    setLocalFormId(form.id)
    setSelectedFormLabel(form.name)
    setPickerOpen(false)
    setTestLeadMessage(null)
  }

  function handleRequestTestLead() {
    if (!localFormId) return
    setTestLeadMessage(null)
    startTestLeadTransition(async () => {
      const result = await requestMetaTestLeadAction(localFormId)
      if (result.success) {
        setTestLeadMessage({
          type: "success",
          text: `Testlead angefordert (${result.leadId}). Bestaetigung der Webhook-Zustellung erscheint hier in wenigen Sekunden nach Neuladen der Seite.`,
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
    if (isKanzlei) {
      fd.append("field_template_id", localTemplateId)
      fd.append("meta_form_id", localFormId)
      fd.append("meta_form_name", localFormId ? selectedFormLabel ?? "" : "")
      fd.append("skip_lead_confirmation", localSkipConfirmation ? "1" : "0")
    } else {
      fd.append("meta_form_id", localFormId)
      fd.append("meta_form_name", selectedFormLabel ?? "")
      fd.append("meta_field_mapping_json", "[]")
    }
    fd.append("berufsbild", localBerufsbild)
    fd.append("plz", localPlz)
    fd.append("radius_km", localRadiusKm)
    if (isKanzlei) fd.append("extra_plz", localExtraPlz)
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
              {bb.choices(localBerufsbild).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <label className="text-xs font-medium text-gray-500">Umkreis</label>
              <RadiusControl value={Number(localRadiusKm) || 25} onChange={(km) => setLocalRadiusKm(String(km))} label={null} />
            </div>
          </div>
          {isKanzlei && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">Weitere Standorte (PLZ)</label>
              <input
                value={localExtraPlz}
                onChange={(e) => setLocalExtraPlz(e.target.value)}
                placeholder="z. B. 20095, 30159"
                className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
                style={{ borderColor: "#dde3ea" }}
              />
              <span className="text-xs text-gray-400">
                Für zusammengeführte Stellen an mehreren Orten: Ein Kandidat passt, wenn er im Umkreis eines dieser Standorte wohnt.
              </span>
            </div>
          )}
        </div>
      </section>

      <div className="h-px" style={{ backgroundColor: "#dde3ea" }} />

      {isKanzlei && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Feld-Vorlage</h3>
          <p className="mb-3 text-xs text-gray-400">
            Welche Zusatzfelder bei Kandidaten dieser Kampagne angezeigt werden (Profil und Kundenportal). Vorlagen pflegst du
            unter Einstellungen → Feld-Vorlagen.
          </p>
          <select
            value={localTemplateId}
            onChange={(e) => setLocalTemplateId(e.target.value)}
            className="max-w-sm rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "#dde3ea", backgroundColor: "white" }}
          >
            <option value="">
              Standardvorlage{fieldTemplates.find((t) => t.is_default) ? ` (${fieldTemplates.find((t) => t.is_default)!.name})` : " (alle Zusatzfelder)"}
            </option>
            {fieldTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </section>
      )}

      {/* Eigene Meta-Kampagne der Kanzlei (Paket 80): Kampagnen ohne "KS24" im Namen laufen
          für eine Kanzlei - ihr Formular hier verknüpfen, dann kommen die Leads direkt in
          diese Kampagne (Herkunft), werden im Team vorqualifiziert und dann zugeordnet. */}
      {isKanzlei && (
        <section>
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Lead-Formular aus eigener Meta-Kampagne</h3>
          <p className="mb-3 text-xs text-gray-400">
            Für Kanzleien mit eigener Meta-Kampagne (ohne „KS24“ im Kampagnennamen): Formular verknüpfen, dann kommen die Leads
            automatisch in diese Kampagne. Die Kanzlei sieht sie erst, wenn ihr sie vorqualifiziert und zuordnet.
          </p>
          <div className="flex max-w-xl flex-col gap-2">
            {localFormId ? (
              <div className="flex flex-col gap-1 rounded-lg border px-3 py-2" style={{ borderColor: "#dde3ea" }}>
                <span className="text-xs font-medium text-gray-500">Verknüpftes Formular</span>
                <span className="text-sm text-gray-700">{selectedFormLabel || "Name unbekannt"}</span>
                <code className="text-xs text-gray-400">{localFormId}</code>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Kein Formular verknüpft.</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={openOwnPicker} className="w-fit text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
                {localFormId ? "Anderes Formular wählen" : "Formular verknüpfen"}
              </button>
              {localFormId && (
                <>
                  <button
                    type="button"
                    onClick={handleRequestTestLead}
                    disabled={testLeadPending}
                    className="w-fit text-xs font-medium hover:underline disabled:opacity-50"
                    style={{ color: "#1e56a0" }}
                  >
                    {testLeadPending ? "Wird angefordert…" : "Testlead anfordern"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalFormId("")
                      setSelectedFormLabel(null)
                    }}
                    className="w-fit text-xs text-gray-400 hover:text-red-600 hover:underline"
                  >
                    Verknüpfung lösen
                  </button>
                </>
              )}
            </div>
            {testLeadMessage && (
              <p className="text-xs" style={{ color: testLeadMessage.type === "success" ? "#1a9a6a" : "#dc2626" }}>
                {testLeadMessage.text}
              </p>
            )}
            {metaWebhookLastTestAt && localFormId === (metaFormId ?? "") && (
              <p className="text-xs" style={{ color: "#1a9a6a" }}>
                ✓ Verbindung zuletzt per Webhook bestätigt: {new Date(metaWebhookLastTestAt).toLocaleString("de-DE")}
              </p>
            )}
            <label className="mt-1 flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5" checked={localSkipConfirmation} onChange={(e) => setLocalSkipConfirmation(e.target.checked)} />
              <span>
                Keine Eingangsbestätigung an Leads dieser Kampagne
                <span className="block text-xs text-gray-400">
                  Überspringt die allgemeine Eingangsbestätigung (Einstellungen → E-Mail-Vorlagen) – sinnvoll, wenn sich die Bewerber
                  auf eine Anzeige der Kanzlei beworben haben.
                </span>
              </span>
            </label>
            {(localFormId !== (metaFormId ?? "") || localSkipConfirmation !== skipLeadConfirmation) && (
              <p className="text-xs text-amber-700">Noch nicht gespeichert – unten „Einstellungen speichern“.</p>
            )}

            {ownOpen && (
              <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "#dde3ea" }}>
                <div className="flex items-center gap-2">
                  <input
                    value={ownQuery}
                    onChange={(e) => setOwnQuery(e.target.value)}
                    placeholder="Meta-Kampagne suchen…"
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
                    style={{ borderColor: "#dde3ea" }}
                  />
                  <button type="button" onClick={() => setOwnOpen(false)} className="shrink-0 text-xs text-gray-400 hover:underline">
                    Schließen
                  </button>
                </div>
                {ownPending && <p className="text-xs text-gray-400">Laufende Meta-Kampagnen werden geladen…</p>}
                {ownError && <p className="text-xs text-red-600">{ownError}</p>}
                {ownCampaigns?.length === 0 && <p className="text-xs text-gray-400">Keine laufende Meta-Kampagne ohne „KS24“ gefunden.</p>}
                <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
                  {(ownCampaigns ?? [])
                    .filter((c) => !ownQuery.trim() || c.name.toLowerCase().includes(ownQuery.trim().toLowerCase()))
                    .map((c) => (
                      <li key={c.id} className="rounded-md border px-3 py-2" style={{ borderColor: "#eef2f6" }}>
                        <p className="text-sm font-medium text-gray-800">{c.name}</p>
                        {c.forms.length === 0 && <p className="text-xs text-gray-400">Kein Lead-Formular in den Anzeigen gefunden.</p>}
                        <ul className="mt-1 flex flex-col gap-1">
                          {c.forms.map((f) => {
                            const linkedElsewhere = f.linkedTo && f.linkedTo.id !== campaignId
                            const inactive = !isSelectableForm(f)
                            return (
                              <li key={f.formId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                                <span className="min-w-0 text-gray-600">
                                  {f.formName ?? `Formular ${f.formId}`}
                                  {f.pageName ? <span className="text-gray-400"> · Seite {f.pageName}</span> : null}
                                  {!f.accessible && (
                                    <span className="ml-1 text-amber-700">· Seite nicht freigegeben – Leads kommen erst nach Freigabe im Business Manager</span>
                                  )}
                                  {inactive && <span className="ml-1 text-gray-400">· nicht aktiv</span>}
                                  {linkedElsewhere && <span className="ml-1 text-gray-400">· verknüpft mit „{f.linkedTo!.title}“</span>}
                                </span>
                                <button
                                  type="button"
                                  disabled={inactive || f.formId === localFormId}
                                  onClick={() => handleOwnFormSelect(c.name, f.formId, f.formName)}
                                  className="shrink-0 rounded-md border px-2 py-0.5 font-medium disabled:opacity-40"
                                  style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
                                >
                                  {f.formId === localFormId ? "Ausgewählt" : "Auswählen"}
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Meta Form ID - nur Lead-Kampagnen */}
      {!isKanzlei && (
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
                <span className="text-sm text-gray-700">
                  {selectedFormLabel ?? "Name unbekannt (manuell eingetragen oder vor Rollout dieser Änderung gespeichert)"}
                </span>
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
              {localFormId && (
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
            {testLeadMessage && (
              <p
                className="text-xs"
                style={{ color: testLeadMessage.type === "success" ? "#1a9a6a" : "#dc2626" }}
              >
                {testLeadMessage.text}
              </p>
            )}
            {metaWebhookLastTestAt && (
              <p className="text-xs" style={{ color: "#1a9a6a" }}>
                ✓ Verbindung zuletzt per Webhook bestaetigt:{" "}
                {new Date(metaWebhookLastTestAt).toLocaleString("de-DE")}
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
              <SearchableSelect
                options={(pages ?? []).map((p) => ({ id: p.id, label: p.name }))}
                value={selectedPageId}
                onChange={handlePageChange}
                disabled={pagesPending || pages === null}
                loading={pagesPending || pages === null}
                loadingLabel="Seiten werden geladen…"
                placeholder="Seite suchen…"
                emptyLabel="Keine Seite gefunden"
              />
              {pagesError && <p className="text-xs text-red-600">{pagesError}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-500">Formular</label>
              <SearchableSelect
                options={(forms ?? []).map((f) => ({ id: f.id, label: f.name }))}
                value=""
                onChange={(formId) => {
                  const form = forms?.find((f) => f.id === formId)
                  if (form) handleFormSelect(form)
                }}
                disabled={!selectedPageId || formsPending || forms === null}
                loading={!!selectedPageId && (formsPending || forms === null)}
                loadingLabel="Formulare werden geladen…"
                placeholder={!selectedPageId ? "Erst Seite wählen" : "Formular suchen…"}
                emptyLabel="Keine Formulare gefunden"
              />
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
      )}

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
