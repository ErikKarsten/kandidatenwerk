"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, AlertTriangle, Plus, X } from "lucide-react"
import { PROFILE_FIELDS, PROJECT_PHASES, contractEnd, missingProfileItems, type ClientProfileValues } from "@/lib/client-project"
import { finalizeClientProfileAction, saveClientProfileAction, updateProjectMetaAction } from "./project-actions"
import { ProjectPositions, type ClientPosition } from "./project-positions"

export interface ProjectMeta {
  project_phase: string
  contract_start: string | null
  contract_term_months: number | null
  key_account_manager_id: string | null
  close_lead_id: string | null
  // Nur Anzeige (kommen aus Close über den Webhook).
  close_url?: string | null
  close_status?: string | null
  close_status_at?: string | null
}

export interface ClientProfileData extends ClientProfileValues {
  finalized_at: string | null
  finalized_by_name: string | null
}

// Reiter "Projekt" beim Kunden (Paket 9, ersetzt ClickUp): Phase/Vertrag, Kanzleiprofil
// mit Onboarding-Hinweis, gesuchte Stellen und Kommentare. Nur für das Team.
export function ProjectTab({
  clientId,
  meta,
  profile,
  positions,
  campaigns,
  team,
}: {
  clientId: string
  meta: ProjectMeta
  profile: ClientProfileData | null
  positions: ClientPosition[]
  campaigns: { id: string; title: string }[]
  team: { id: string; full_name: string | null }[]
}) {
  const missing = missingProfileItems(profile, positions.length)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <OnboardingBanner clientId={clientId} profile={profile} missing={missing} />
      <ProjectMetaCard clientId={clientId} meta={meta} team={team} />
      <ProfileCard clientId={clientId} profile={profile} missing={missing} />
      <ProjectPositions clientId={clientId} positions={positions} campaigns={campaigns} />
    </div>
  )
}

function OnboardingBanner({ clientId, profile, missing }: { clientId: string; profile: ClientProfileData | null; missing: string[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggle(finalize: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await finalizeClientProfileAction(clientId, finalize)
      if (result?.error) return setError(result.error)
      router.refresh()
    })
  }

  if (profile?.finalized_at) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "#1a9a6a55", backgroundColor: "#1a9a6a0d" }}>
        <p className="flex items-center gap-2 text-sm" style={{ color: "#1a9a6a" }}>
          <CheckCircle2 size={16} />
          Kanzleiprofil abgeschlossen am {new Date(profile.finalized_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}
          {profile.finalized_by_name ? ` von ${profile.finalized_by_name}` : ""}
        </p>
        <button type="button" onClick={() => toggle(false)} disabled={pending} className="text-xs text-gray-500 hover:underline">
          Wieder öffnen
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "#f59e0b66", backgroundColor: "#f59e0b0d" }}>
      <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
        <AlertTriangle size={16} />
        Kanzleiprofil ist noch nicht final – bitte vor dem Willkommensmeeting vervollständigen und abschließen.
      </p>
      {missing.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-amber-800">
          Es fehlt noch:
          {missing.map((m) => (
            <span key={m} className="rounded-full border px-2 py-0.5 font-medium" style={{ borderColor: "#f59e0b", backgroundColor: "#fef3c7", color: "#92400e" }}>
              {m}
            </span>
          ))}
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => toggle(true)} disabled={pending} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1a9a6a" }}>
            {pending ? "…" : "Kanzleiprofil abschließen"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function ProjectMetaCard({ clientId, meta, team }: { clientId: string; meta: ProjectMeta; team: { id: string; full_name: string | null }[] }) {
  const router = useRouter()
  const [v, setV] = useState(meta)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const end = contractEnd(v.contract_start, v.contract_term_months)
  const dirty = JSON.stringify(v) !== JSON.stringify(meta)
  const input = "w-full rounded-md border px-2 py-1.5 text-sm"

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateProjectMetaAction(clientId, {
        project_phase: v.project_phase,
        contract_start: v.contract_start,
        contract_term_months: v.contract_term_months,
        key_account_manager_id: v.key_account_manager_id,
        close_lead_id: v.close_lead_id,
      })
      if (result?.error) return setError(result.error)
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Projekt</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Phase</span>
          <select className={input} style={{ borderColor: "#dde3ea" }} value={v.project_phase} onChange={(e) => (setV({ ...v, project_phase: e.target.value }), setSaved(false))}>
            {PROJECT_PHASES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Key Account Manager</span>
          <select
            className={input}
            style={{ borderColor: "#dde3ea" }}
            value={v.key_account_manager_id ?? ""}
            onChange={(e) => (setV({ ...v, key_account_manager_id: e.target.value || null }), setSaved(false))}
          >
            <option value="">Nicht festgelegt</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? "Ohne Namen"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Vertragsstart</span>
          <input
            type="date"
            className={input}
            style={{ borderColor: "#dde3ea" }}
            value={v.contract_start ?? ""}
            onChange={(e) => (setV({ ...v, contract_start: e.target.value || null }), setSaved(false))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-500">Laufzeit (Monate)</span>
          <input
            type="number"
            min={1}
            className={input}
            style={{ borderColor: "#dde3ea" }}
            value={v.contract_term_months ?? ""}
            onChange={(e) => (setV({ ...v, contract_term_months: e.target.value ? Number(e.target.value) : null }), setSaved(false))}
          />
        </label>
      </div>
      <details className="mt-3 text-xs text-gray-500">
        <summary className="cursor-pointer select-none">Close-Verknüpfung{meta.close_status ? ` · ${meta.close_status}` : ""}</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-xs font-medium text-gray-500">Close-Lead-ID</span>
          <input
            className={input}
            style={{ borderColor: "#dde3ea" }}
            value={v.close_lead_id ?? ""}
            placeholder="lead_…"
            onChange={(e) => (setV({ ...v, close_lead_id: e.target.value || null }), setSaved(false))}
          />
        </label>
        <div className="flex flex-col justify-end gap-1 lg:col-span-2">
          {meta.close_status && (
            <span className="text-xs text-gray-500">
              Status in Close: <strong className="text-gray-800">{meta.close_status}</strong>
              {meta.close_status_at ? ` (${new Date(meta.close_status_at).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })})` : ""}
            </span>
          )}
          {meta.close_url && (
            <a href={meta.close_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium hover:underline" style={{ color: "#1e56a0" }}>
              In Close öffnen ↗
            </a>
          )}
        </div>
      </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !dirty} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40" style={{ backgroundColor: "#1e56a0" }}>
          {pending ? "Speichert…" : "Speichern"}
        </button>
        {end && <span className="text-xs text-gray-500">Vertragsende: {new Date(`${end}T12:00:00Z`).toLocaleDateString("de-DE", { timeZone: "UTC" })}</span>}
        {saved && !dirty && <span className="text-xs" style={{ color: "#1a9a6a" }}>Gespeichert</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  )
}

// Fehlende Pflichtangaben sind gelb markiert - in der Ansicht als "fehlt noch", im
// Bearbeiten-Modus als gelb umrandetes Feld (Paket 13).
const MISSING_STYLE = { borderColor: "#f59e0b", backgroundColor: "#fffbeb" }

function ProfileCard({ clientId, profile, missing }: { clientId: string; profile: ClientProfileData | null; missing: string[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState<ClientProfileValues>({})
  const [newBenefit, setNewBenefit] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const input = "w-full rounded-md border px-2 py-1.5 text-sm"

  function startEdit() {
    setV({ ...(profile ?? {}), benefits: [...(profile?.benefits ?? [])] })
    setEditing(true)
  }

  function addBenefit() {
    const b = newBenefit.trim()
    if (!b) return
    setV({ ...v, benefits: [...(v.benefits ?? []), b] })
    setNewBenefit("")
  }

  function save() {
    setError(null)
    const values = { ...v, benefits: newBenefit.trim() ? [...(v.benefits ?? []), newBenefit.trim()] : v.benefits }
    startTransition(async () => {
      const result = await saveClientProfileAction(clientId, values)
      if (result?.error) return setError(result.error)
      setNewBenefit("")
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Kanzleiprofil</h3>
        {!editing && (
          <button type="button" onClick={startEdit} className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
            {profile ? "Bearbeiten" : "Ausfüllen"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {PROFILE_FIELDS.map((f) => (
              <label key={f.key} className={`flex flex-col gap-1 ${f.multiline ? "sm:col-span-2" : ""}`}>
                <span className="text-xs font-medium text-gray-500">
                  {f.label}
                  {f.required ? " *" : ""}
                </span>
                {f.multiline ? (
                  <textarea
                    className={input}
                    style={f.required && !(v[f.key] ?? "").trim() ? MISSING_STYLE : { borderColor: "#dde3ea" }}
                    rows={4}
                    value={v[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    className={input}
                    style={f.required && !(v[f.key] ?? "").trim() ? MISSING_STYLE : { borderColor: "#dde3ea" }}
                    value={v[f.key] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500">Benefits *</span>
            <div className="flex flex-wrap gap-1.5">
              {(v.benefits ?? []).map((b, i) => (
                <span key={`${b}-${i}`} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                  {b}
                  <button type="button" onClick={() => setV({ ...v, benefits: (v.benefits ?? []).filter((_, j) => j !== i) })} aria-label={`${b} entfernen`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                className={input}
                style={(v.benefits ?? []).length === 0 && !newBenefit.trim() ? MISSING_STYLE : { borderColor: "#dde3ea" }}
                value={newBenefit}
                placeholder="z.B. Jobrad, 30 Tage Urlaub, Fortbildungsbudget"
                onChange={(e) => setNewBenefit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addBenefit()
                  }
                }}
              />
              <button type="button" onClick={addBenefit} className="rounded-md border p-1.5 text-gray-500 hover:bg-gray-50" style={{ borderColor: "#dde3ea" }} aria-label="Benefit hinzufügen">
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
              {pending ? "Speichert…" : "Profil speichern"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:underline">
              Abbrechen
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        </div>
      ) : !profile ? (
        <p className="text-sm text-gray-400">Noch kein Kanzleiprofil – „Ausfüllen“ klicken.</p>
      ) : (
        <dl className="flex flex-col gap-3">
          {PROFILE_FIELDS.filter((f) => (profile[f.key] ?? "").trim() || missing.includes(f.label)).map((f) =>
            (profile[f.key] ?? "").trim() ? (
              <div key={f.key}>
                <dt className="text-xs font-medium text-gray-400">{f.label}</dt>
                <dd className="whitespace-pre-wrap text-sm text-gray-800">{profile[f.key]}</dd>
              </div>
            ) : (
              <div key={f.key} className="rounded-md border px-2 py-1" style={MISSING_STYLE}>
                <dt className="text-xs font-medium text-amber-800">{f.label}</dt>
                <dd className="text-xs text-amber-700">fehlt noch</dd>
              </div>
            )
          )}
          {missing.includes("Benefits") && (
            <div className="rounded-md border px-2 py-1" style={MISSING_STYLE}>
              <dt className="text-xs font-medium text-amber-800">Benefits</dt>
              <dd className="text-xs text-amber-700">fehlt noch</dd>
            </div>
          )}
          {(profile.benefits ?? []).length > 0 && (
            <div>
              <dt className="text-xs font-medium text-gray-400">Benefits</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {(profile.benefits ?? []).map((b, i) => (
                  <span key={`${b}-${i}`} className="rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                    {b}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
