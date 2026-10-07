"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ExternalLink, Mail, Phone, X } from "lucide-react"
import { BERUFSBILD_OPTIONS } from "@/lib/berufsbild"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"
import { updateCandidateBerufsbildAction } from "@/app/dashboard/candidates/[id]/actions"
import { assignCandidateToCampaignAction } from "@/app/dashboard/campaigns/[id]/actions"
import { getCandidatePanelDataAction, type CandidatePanelData } from "./actions"
import { CvExportMenu } from "@/components/dashboard/cv-export-menu"
import { TagChip, TagEditor } from "@/components/dashboard/tag-editor"
import { visibleTags } from "@/lib/candidate-tags"
import { PERSONAL_FIELD_KEYS, anonymousName, maskContactData } from "@/lib/show-mode"

// Seitenfenster für einen Kandidaten (Paket 13, T-55/T-56): öffnet rechts über Karte
// oder Liste, ohne die Seite zu verlassen - Suche, Filter und Kartenausschnitt bleiben.
// Mit campaign (Kanzlei-Kampagne) gibt es zusätzlich "Zuordnen". Ohne abdunkelnden
// Hintergrund, damit man direkt den nächsten Kandidaten anklicken kann; z-index über
// den Leaflet-Bedienelementen (1000). anonymize = Show-Modus (Paket 28, T-110): ohne Name,
// Kontaktdaten, PLZ, Erreichbarkeit, Zuordnungen zu Kanzleien und interne Tags; Lebenslauf
// nur anonymisiert.
export function CandidatePanel({
  candidateId,
  onClose,
  campaign,
  onChanged,
  onAssigned,
  anonymize = false,
}: {
  candidateId: string
  onClose: () => void
  campaign?: { id: string; title: string }
  onChanged?: () => void
  onAssigned?: (candidateId: string) => void
  anonymize?: boolean
}) {
  const router = useRouter()
  const [data, setData] = useState<CandidatePanelData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    getCandidatePanelDataAction(candidateId).then((result) => {
      if (cancelled) return
      if ("error" in result) setError(result.error)
      else {
        setError(null)
        setData(result.data)
      }
    })
    return () => {
      cancelled = true
    }
  }, [candidateId, reload])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  function run(action: () => Promise<{ error: string } | null>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result?.error) return setError(result.error)
      after?.()
      setReload((n) => n + 1)
      onChanged?.()
      router.refresh()
    })
  }

  const current = data?.id === candidateId ? data : null
  const assignedHere = !!campaign && !!current?.assignments.some((a) => a.campaignId === campaign.id)

  return (
    <>
      <aside
        className="fixed right-0 top-0 z-[1100] flex h-full w-full max-w-md flex-col overflow-hidden border-l bg-white shadow-2xl"
        style={{ borderColor: "#dde3ea" }}
        aria-label="Kandidat"
      >
        <div className="flex items-start justify-between gap-2 border-b px-5 py-4" style={{ borderColor: "#eef2f6" }}>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-gray-900">
              {current ? (anonymize ? anonymousName(current.id) : `${current.firstName} ${current.lastName}`.trim() || "Ohne Namen") : "Lädt…"}
            </h2>
            {current && (
              <p className="text-xs text-gray-500">
                {anonymize ? "" : current.plz ? `PLZ ${current.plz}` : "Wohnort unbekannt"}
                {current.origin ? `${anonymize ? "" : " · "}über ${current.origin}` : ""}
                {` · seit ${new Date(current.createdAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
          {!current && !error && <p className="text-sm text-gray-400">Lädt…</p>}
          {current && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={current.status}
                  disabled={pending}
                  onChange={(e) => run(() => updateCandidateStatusAction(current.id, e.target.value))}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={{ borderColor: "#dde3ea" }}
                  aria-label="Status"
                >
                  {CANDIDATE_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select
                  value={current.berufsbild ?? ""}
                  disabled={pending}
                  onChange={(e) => run(() => updateCandidateBerufsbildAction(current.id, e.target.value || null))}
                  className="rounded-md border px-2 py-1.5 text-sm"
                  style={current.berufsbild ? { borderColor: "#dde3ea" } : { borderColor: "#f59e0b", backgroundColor: "#fffbeb" }}
                  aria-label="Berufsbild"
                >
                  <option value="">Berufsbild fehlt</option>
                  {BERUFSBILD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {campaign && (
                <button
                  type="button"
                  disabled={pending || assignedHere}
                  onClick={() => run(() => assignCandidateToCampaignAction(campaign.id, current.id), () => onAssigned?.(current.id))}
                  className="rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: assignedHere ? "#1a9a6a" : "#1e56a0" }}
                >
                  {assignedHere ? `Zugeordnet zu „${campaign.title}“` : `Zu „${campaign.title}“ zuordnen`}
                </button>
              )}

              {anonymize ? (
                visibleTags(current.tags, true).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {visibleTags(current.tags, true).map((t) => (
                      <TagChip key={t} tag={t} />
                    ))}
                  </div>
                )
              ) : (
                <TagEditor key={current.id} candidateId={current.id} tags={current.tags} knownTags={current.knownTags} onChanged={onChanged} />
              )}

              {!anonymize && (
              <div className="flex flex-col gap-1.5 text-sm">
                {current.phone && (
                  <a href={`tel:${current.phone}`} className="inline-flex items-center gap-2 hover:underline" style={{ color: "#1e56a0" }}>
                    <Phone size={14} /> {current.phone}
                  </a>
                )}
                {current.email && (
                  <a href={`mailto:${current.email}`} className="inline-flex items-center gap-2 break-all hover:underline" style={{ color: "#1e56a0" }}>
                    <Mail size={14} /> {current.email}
                  </a>
                )}
              </div>
              )}

              {current.stammdaten.length + current.zusatzfelder.length > 0 && (
                <dl className="flex flex-col gap-2">
                  {[...current.stammdaten, ...current.zusatzfelder].filter((f) => !(anonymize && PERSONAL_FIELD_KEYS.has(f.key))).map((f) => (
                    <div key={f.label}>
                      <dt className="text-xs font-medium text-gray-400">{f.label}</dt>
                      <dd className="whitespace-pre-wrap text-sm text-gray-800">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {current.notes && (
                <div>
                  <p className="text-xs font-medium text-gray-400">Beschreibung</p>
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{anonymize ? maskContactData(current.notes) : current.notes}</p>
                </div>
              )}

              {!anonymize && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-400">Zugeordnet ({current.assignments.length})</p>
                {current.assignments.length === 0 ? (
                  <p className="text-sm text-gray-400">Noch keiner Kanzlei zugeordnet.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {current.assignments.map((a) => (
                      <li key={a.id}>
                        <Link href={`/dashboard/clients/${a.clientId}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                          {a.clientName}
                        </Link>
                        <span className="text-xs text-gray-500"> · {a.campaignTitle ?? "ohne Kampagne"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3" style={{ borderColor: "#eef2f6" }}>
          {!anonymize && (
          <a
            href={`/dashboard/candidates/${candidateId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
            style={{ color: "#1e56a0" }}
          >
            Vollständiges Profil <ExternalLink size={13} />
          </a>
          )}
          <CvExportMenu candidateId={candidateId} openUp anonymOnly={anonymize} />
        </div>
      </aside>
    </>
  )
}
