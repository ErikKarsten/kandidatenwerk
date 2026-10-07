"use client"

import { useRouter } from "next/navigation"
import { buildCv } from "@/lib/cv"
import { maskContactData, anonymousName } from "@/lib/show-mode"
import { visibleTags } from "@/lib/candidate-tags"
import { berufsbildLabel } from "@/lib/berufsbild"
import { CvExportMenu } from "@/components/dashboard/cv-export-menu"
import { ShowModeToggle } from "@/components/dashboard/show-mode-toggle"
import { TagChip } from "@/components/dashboard/tag-editor"
import type { CustomFieldDefinition } from "./profile-tab"

// Vorführansicht eines Kandidaten im Show-Modus (Paket 29, T-110): nur, was man einer
// Kanzlei zeigen darf - Kennung statt Name, Profil wie im anonymisierten Lebenslauf und die
// Beschreibung (Kontaktdaten darin ausgeblendet). Keine Kontaktdaten, kein Wohnort, keine
// Reiter, kein Verlauf, keine Kanzlei-Notizen, keine internen Tags.
export function CandidateShowView({
  candidate,
  customFieldDefinitions,
  onShowModeChange,
}: {
  candidate: {
    id: string
    first_name: string
    last_name: string
    berufsbild: string | null
    plz: string | null
    notes: string | null
    tags: string[]
    custom_fields: Record<string, string> | null
  }
  customFieldDefinitions: CustomFieldDefinition[]
  onShowModeChange: (on: boolean) => void
}) {
  const router = useRouter()
  const cv = buildCv({ ...candidate, email: null, phone: null }, customFieldDefinitions, true)
  const facts = cv.facts.filter((f) => f.label !== "Wohnort")
  const tags = visibleTags(candidate.tags, true)

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <button type="button" onClick={() => router.back()} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          ← Zurück zur Übersicht
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{anonymousName(candidate.id)}</h1>
            {candidate.berufsbild && (
              <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "#1e56a0", color: "#1e56a0", backgroundColor: "#1e56a010" }}>
                {berufsbildLabel(candidate.berufsbild)}
              </span>
            )}
            {tags.map((t) => (
              <TagChip key={t} tag={t} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <CvExportMenu candidateId={candidate.id} anonymOnly />
            <ShowModeToggle on onChange={onShowModeChange} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[60%_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
          {facts.length > 0 && (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs font-medium text-gray-400">{f.label}</dt>
                  <dd className="text-sm font-semibold text-gray-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {cv.sections.map((s) => (
            <section key={s.title} className="border-t pt-4" style={{ borderColor: "#eef2f6" }}>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">{s.title}</h2>
              <dl className="flex flex-col gap-2">
                {s.items.map((i) => (
                  <div key={i.label}>
                    <dt className="text-xs font-medium text-gray-400">{i.label}</dt>
                    <dd className="whitespace-pre-wrap text-sm text-gray-800">{i.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          {facts.length === 0 && cv.sections.length === 0 && <p className="text-sm text-gray-400">Noch keine Profilangaben.</p>}
        </div>

        <div className="flex flex-col gap-4">
          {candidate.notes?.trim() && (
            <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
              <h2 className="mb-2 text-sm font-semibold text-gray-900">Kurzprofil</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700">{maskContactData(candidate.notes)}</p>
            </div>
          )}
          <p className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#7c3aed14", color: "#5b21b6" }}>
            Show-Modus: Name, Kontaktdaten, Wohnort und interne Angaben sind ausgeblendet.
          </p>
        </div>
      </div>
    </div>
  )
}
