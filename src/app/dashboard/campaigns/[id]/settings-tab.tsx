"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { updateCampaignSettingsAction } from "./actions"

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
          ID des Meta-Formulars, aus dem Leads importiert werden. Die Formular-Antworten
          werden automatisch per KI den passenden Kandidaten-Zusatzfeldern zugeordnet -
          keine manuelle Feldkonfiguration nötig.
        </p>
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
