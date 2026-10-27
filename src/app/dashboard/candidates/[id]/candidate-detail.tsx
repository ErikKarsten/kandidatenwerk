"use client"

import { useLayoutEffect, useRef, useState, useTransition } from "react"
import { useGoBack } from "@/components/navigation-tracker"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Briefcase, Check, ChevronDown, ListTodo, Mail, MapPin, Megaphone, MoreHorizontal, Phone, Trash2, type LucideIcon } from "lucide-react"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"
import {
  saveDescriptionAction,
  saveOpenQuestionsAction,
  archiveCandidateAction,
  deleteCandidateAction,
  deleteDemoCandidateAction,
} from "./actions"
import { ProfileTab, type CustomFieldDefinition } from "./profile-tab"
import { FilesTab } from "./files-tab"
import { HistorySection, type HistoryEntry } from "./history-section"
import { ClientNotesSection, type ClientNote } from "./client-notes-section"
import { type ClientOption } from "./client-assignment-section"
import { WEITERE_ANTWORTEN_KEY } from "@/lib/candidate-custom-fields"
import { type ActiveAssignment } from "./matches-section"
import { AssignmentTab, type KanzleiCampaignOption } from "./assignment-tab"
import type { KanzleiOption } from "@/lib/kanzlei-umkreis"
import { TasksPanel } from "@/components/dashboard/tasks-panel"
import type { TaskItemData } from "@/components/dashboard/task-item"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"
import { TaskFormModal, type ProfileOption } from "@/components/dashboard/task-form-modal"
import { CommunicationTab, type CandidateMessage, type MessageTemplate } from "./communication-tab"
import type { TemplateVars } from "@/lib/automation-engine"
import { CvExportMenu } from "@/components/dashboard/cv-export-menu"
import { CallButton } from "@/components/dashboard/call-button"
import { ACTIVE_SOURCING_SOURCE } from "@/lib/teams"
import { TagEditor } from "@/components/dashboard/tag-editor"
import { useShowMode } from "@/lib/show-mode"
import { CandidateShowView } from "./show-view"
import { SAMPLE_TAG } from "@/lib/candidate-tags"
import { CopyButton } from "@/components/ui/copy-button"

const STATUS_OPTIONS = CANDIDATE_STATUS_OPTIONS
const STATUS_COLORS = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o]))

interface FileItem {
  id: string
  name: string
  storage_path: string
  size: number | null
  mime_type: string | null
  created_at: string
  signedUrl: string | null
}

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: string
  source: string
  notes: string | null
  offene_fragen: string | null
  bewerbung: string | null
  cv_werdegang: string | null
  tags: string[]
  description: string | null
  berufsbild: string | null
  plz: string | null
  lat: number | null
  lng: number | null
  custom_fields: Record<string, string> | null
  is_demo?: boolean
  campaign_id: string | null
  campaigns: { title: string; kind: string; berufsbild: string | null; clients: { id: string; name: string } | null } | null
}

interface CandidateDetailProps {
  candidate: Candidate
  // Nur Admins sehen, dass es ein Musterdatensatz ist (Paket 76).
  canSeeSamples?: boolean
  history: HistoryEntry[]
  files: FileItem[]
  activeAssignments: ActiveAssignment[]
  clients: ClientOption[]
  clientNotes: ClientNote[]
  profiles: ProfileOption[]
  customFieldDefinitions: CustomFieldDefinition[]
  // Zusatzfelder laut Feld-Vorlage(n), null = alle (Paket 8).
  templateFieldKeys: string[] | null
  kanzleiCampaigns: KanzleiCampaignOption[]
  kanzleien: KanzleiOption[]
  tasks: TaskItemData[]
  currentUserId: string
  initialTab?: "zuordnung" | "dateien" | "kommunikation" | "aufgaben"
  communication: { vars: TemplateVars; templates: MessageTemplate[]; messages: CandidateMessage[] }
  knownTags: string[]
}

type ModalStep = null | "choice"

export function CandidateDetail({ candidate, canSeeSamples = true, history, files, activeAssignments, clients, clientNotes, profiles, customFieldDefinitions, templateFieldKeys, kanzleiCampaigns, kanzleien, communication, knownTags, tasks, currentUserId, initialTab }: CandidateDetailProps) {
  const router = useRouter()
  const goBack = useGoBack("/dashboard/candidates")
  const [statusPending, startStatusTransition] = useTransition()
  const [tab, setTab] = useState<"profil" | "dateien" | "zuordnung" | "kommunikation" | "aufgaben">(initialTab ?? "profil")
  // Klick auf eine #Aufgabe im Verlauf springt zum Reiter "Aufgaben" (Paket 78).
  const tabsRef = useRef<HTMLDivElement>(null)
  const [modalStep, setModalStep] = useState<ModalStep>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [archivePending, startArchiveTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [showMode] = useShowMode()


  // Status sofort zeigen, dann speichern (Paket 69: eigenes Menü statt Auswahlfeld).
  const [status, setStatus] = useState(candidate.status)
  function changeStatus(newStatus: string) {
    setStatus(newStatus)
    startStatusTransition(async () => {
      await updateCandidateStatusAction(candidate.id, newStatus, candidate.campaign_id ?? undefined)
      router.refresh()
    })
  }

  function handleArchive() {
    startArchiveTransition(async () => {
      const result = await archiveCandidateAction(candidate.id)
      if (result?.error) { setModalError(result.error); return }
      router.push("/dashboard/candidates")
    })
  }

  function handleDelete() {
    startDeleteTransition(async () => {
      const result = await deleteCandidateAction(candidate.id)
      if (result?.error) { setModalError(result.error); return }
      router.push("/dashboard/candidates")
    })
  }

  // Beispiel-Lead (Paket 14, T-68): Löschen ohne Rückfrage-Dialog, zurück zum Kunden.
  function handleDeleteDemo() {
    if (!confirm("Beispiel-Lead samt Beispielkampagne löschen? Beides verschwindet auch aus dem Kundenportal.")) return
    startDeleteTransition(async () => {
      const result = await deleteDemoCandidateAction(candidate.id)
      if (result?.error) { setModalError(result.error); return }
      goBack()
    })
  }

  // Anonymisierter Modus (Paket 29): eigene Vorführansicht ohne personenbezogene Daten.
  if (showMode) {
    return <CandidateShowView candidate={candidate} customFieldDefinitions={customFieldDefinitions} />
  }

  return (
    <div className="flex flex-col gap-6 overflow-x-hidden p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>

      {/* Modal */}
      {modalStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white shadow-xl" style={{ borderColor: "#dde3ea" }}>
            <div className="p-6 flex flex-col gap-4">
              <h2 className="text-base font-semibold text-gray-900">Wie möchten Sie fortfahren?</h2>

              {/* Archive option */}
              <div className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: "#dde3ea" }}>
                <div>
                  <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}>
                    Empfohlen
                  </span>
                  <p className="text-sm font-semibold text-gray-900">Archivieren</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Kandidat wird aus der normalen Ansicht ausgeblendet. Profil, Dateien und Verlauf bleiben erhalten.
                  </p>
                </div>
                <button
                  onClick={handleArchive}
                  disabled={archivePending || deletePending}
                  className="self-start rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#dde3ea" }}
                >
                  {archivePending ? "Wird archiviert…" : "Archivieren"}
                </button>
              </div>

              {/* Delete option */}
              <div className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: "#fca5a5" }}>
                <div>
                  <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#dc262618", color: "#dc2626" }}>
                    Destruktiv
                  </span>
                  <p className="text-sm font-semibold text-gray-900">Endgültig löschen</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Kandidat, alle Dateien und der komplette Verlauf werden unwiderruflich gelöscht.
                  </p>
                </div>
                <button
                  onClick={handleDelete}
                  disabled={archivePending || deletePending}
                  className="self-start rounded-md border px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                  style={{ borderColor: "#fca5a5", color: "#dc2626" }}
                >
                  {deletePending ? "Wird gelöscht…" : "Endgültig löschen"}
                </button>
              </div>

              {modalError && <p className="text-xs text-red-600">{modalError}</p>}

              <button
                onClick={() => { setModalStep(null); setModalError(null) }}
                disabled={archivePending || deletePending}
                className="self-start text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        {candidate.is_demo && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5 text-sm" style={{ borderColor: "#f59e0b", backgroundColor: "#fffbeb", color: "#92400e" }}>
            <span>
              <strong>Beispiel-Lead</strong> – kein echter Kandidat. Er dient zum Vorführen beim Kunden und im Kundenportal und zählt in keiner Statistik mit.
            </span>
            <button
              type="button"
              onClick={handleDeleteDemo}
              disabled={deletePending}
              className="ml-auto rounded-md border px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              style={{ borderColor: "#fca5a5", backgroundColor: "white" }}
            >
              Beispiel-Lead und Beispielkampagne löschen
            </button>
          </div>
        )}
        {/* Kopf (Paket 69): eine Karte - oben wer (Initialen, Name, Status, Tags) und die
            Aktionen, unten Kontakt und Herkunft in einer ruhigen Zeile. */}
        <button
          type="button"
          onClick={goBack}
          className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Zurück zur Übersicht
        </button>
        <div className="rounded-xl border bg-white" style={{ borderColor: "#dde3ea" }}>
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-semibold"
                style={{ backgroundColor: "#1e56a014", color: "#1e56a0" }}
                aria-hidden
              >
                {initialsOf(candidate.first_name, candidate.last_name)}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900 sm:text-2xl [overflow-wrap:anywhere]">
                  {candidate.first_name} {candidate.last_name}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusMenu value={status} pending={statusPending} onChange={changeStatus} />
                  <TagEditor
                    candidateId={candidate.id}
                    tags={canSeeSamples ? candidate.tags : candidate.tags.filter((t) => t !== SAMPLE_TAG)}
                    hiddenTags={canSeeSamples ? [] : candidate.tags.filter((t) => t === SAMPLE_TAG)}
                    knownTags={canSeeSamples ? knownTags : knownTags.filter((t) => t !== SAMPLE_TAG)}
                    compact
                  />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {candidate.phone && <CallButton candidateId={candidate.id} />}
              <CvExportMenu candidateId={candidate.id} />
              <button
                type="button"
                onClick={() => setTaskModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
              >
                <ListTodo size={15} /> Aufgabe
              </button>
              <MoreActionsMenu onDelete={() => { setModalStep("choice"); setModalError(null) }} />
            </div>
          </div>
          {(candidate.phone || candidate.email || candidate.plz || candidate.bewerbung || candidate.campaigns?.title || candidate.source === ACTIVE_SOURCING_SOURCE) && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-3 sm:px-5" style={{ borderColor: "#eef2f6" }}>
              {candidate.phone && (
                <MetaItem icon={Phone} title="Anrufen">
                  <a href={`tel:${candidate.phone}`} className="hover:underline" style={{ color: "#1e56a0" }}>{candidate.phone}</a>
                </MetaItem>
              )}
              {candidate.email && (
                <MetaItem icon={Mail} title="E-Mail schreiben">
                  <a href={`mailto:${candidate.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>{candidate.email}</a>
                </MetaItem>
              )}
              {candidate.plz && <MetaItem icon={MapPin} title="Wohnort (PLZ)">{candidate.plz}</MetaItem>}
              {/* Worauf und worüber beworben (Paket 46) - lange Namen gekürzt, voll im Tooltip. */}
              {candidate.bewerbung && (
                <MetaItem icon={Briefcase} title={`Bewerbung: ${candidate.bewerbung}`}>
                  <span className="text-gray-400">Bewerbung</span> {candidate.bewerbung}
                </MetaItem>
              )}
              {/* Herkunft Active Sourcing statt Kampagne (Paket 89). */}
              {candidate.source === ACTIVE_SOURCING_SOURCE && !candidate.campaign_id && (
                <MetaItem icon={Megaphone} title="Herkunft: Active Sourcing">
                  <span className="text-gray-400">Herkunft</span> <span style={{ color: "#4338ca" }}>Active Sourcing</span>
                </MetaItem>
              )}
              {candidate.campaigns?.title && candidate.campaign_id && (
                <MetaItem icon={Megaphone} title={`Kampagne: ${candidate.campaigns.title}`}>
                  <span className="text-gray-400">Kampagne</span>{" "}
                  <Link href={`/dashboard/campaigns/${candidate.campaign_id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                    {shortCampaignTitle(candidate.campaigns.title)}
                  </Link>
                </MetaItem>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[60%_minmax(0,1fr)]">
        {/* Linke Spalte */}
        <div className="flex flex-col gap-4">
          {/* Tab-Bar */}
          {/* Ohne sichtbare Scrollleiste (Paket 69); bei schmalem Fenster weiter wischbar. */}
          <div ref={tabsRef} className="flex gap-0 overflow-x-auto overflow-y-hidden border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "#dde3ea" }}>
            <TabButton
              active={tab === "profil"}
              onClick={() => setTab("profil")}
            >
              Profil
            </TabButton>
            <TabButton
              active={tab === "dateien"}
              onClick={() => setTab("dateien")}
            >
              Dateien ({files.length})
            </TabButton>
            <TabButton
              active={tab === "zuordnung"}
              onClick={() => setTab("zuordnung")}
            >
              Zuordnung ({activeAssignments.length})
            </TabButton>
            <TabButton active={tab === "kommunikation"} onClick={() => setTab("kommunikation")}>
              Kommunikation ({communication.messages.length})
            </TabButton>
            <TabButton active={tab === "aufgaben"} onClick={() => setTab("aufgaben")}>
              Aufgaben ({tasks.filter((t) => t.status !== "erledigt").length})
            </TabButton>
          </div>

          <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
            {tab === "profil" && (
              <ProfileTab
                candidateId={candidate.id}
                firstName={candidate.first_name}
                lastName={candidate.last_name}
                email={candidate.email}
                phone={candidate.phone}
                berufsbild={candidate.berufsbild}
                plz={candidate.plz}
                customFields={candidate.custom_fields}
                customFieldDefinitions={customFieldDefinitions}
                templateFieldKeys={templateFieldKeys}
              />
            )}
            {tab === "dateien" && (
              <FilesTab candidateId={candidate.id} files={files} />
            )}
            {tab === "zuordnung" && (
              <AssignmentTab
                candidateId={candidate.id}
                candidateStatus={candidate.status}
                isSample={candidate.tags.includes(SAMPLE_TAG)}
                canSeeSamples={canSeeSamples}
                candidateName={`${candidate.first_name} ${candidate.last_name}`.trim()}
                berufsbild={candidate.berufsbild}
                selfLat={candidate.lat}
                selfLng={candidate.lng}
                origin={{
                  campaignId: candidate.campaign_id,
                  title: candidate.campaigns?.title ?? null,
                  kind: candidate.campaigns?.kind ?? null,
                  clientId: candidate.campaigns?.clients?.id ?? null,
                  clientName: candidate.campaigns?.clients?.name ?? null,
                  source: candidate.source,
                }}
                activeAssignments={activeAssignments}
                clients={clients}
                kanzleiCampaigns={kanzleiCampaigns}
                kanzleien={kanzleien}
              />
            )}
            {tab === "aufgaben" && <TasksPanel tasks={tasks} team={profiles} currentUserId={currentUserId} candidateId={candidate.id} />}
            {tab === "kommunikation" && (
              <CommunicationTab
                candidateId={candidate.id}
                email={candidate.email}
                isDemo={!!candidate.is_demo}
                vars={communication.vars}
                templates={communication.templates}
                messages={communication.messages}
              />
            )}
          </div>
        </div>

        {/* Rechte Spalte */}
        <div className="flex flex-col gap-4">
          <ClientNotesSection notes={clientNotes} />
          <DescriptionSection candidateId={candidate.id} notes={candidate.notes} />
          <DescriptionSection
            candidateId={candidate.id}
            notes={candidate.offene_fragen}
            label="Offene Fragen aus Bewerberrunde"
            placeholder="Was möchte der Kandidat vom neuen Arbeitgeber wissen?"
            save={saveOpenQuestionsAction}
          />
          <HistorySection
            candidateId={candidate.id}
            history={history}
            leadtableDescription={candidate.description}
            weitereAntworten={candidate.custom_fields?.[WEITERE_ANTWORTEN_KEY]}
            team={profiles}
            currentUserId={currentUserId}
            tasks={tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, assigneeName: t.assigneeName }))}
            onOpenTask={() => {
              setTab("aufgaben")
              tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
          />
        </div>
      </div>

      {taskModalOpen && (
        <TaskFormModal
          profiles={profiles}
          candidateId={candidate.id}
          onClose={() => setTaskModalOpen(false)}
        />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        color: active ? "#1e56a0" : "#6b7280",
        borderBottom: active ? "2px solid #1e56a0" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {children}
    </button>
  )
}

// Ab dieser Höhe (etwa 14 Zeilen) klappen lange Texte ein und scrollen im Feld (Paket 67).
const DESCRIPTION_COLLAPSED_PX = 320

function DescriptionSection({
  candidateId,
  notes,
  label = "Beschreibung",
  placeholder = "Notizen zum Kandidaten…",
  save = saveDescriptionAction,
}: {
  candidateId: string
  notes: string | null
  label?: string
  placeholder?: string
  save?: (candidateId: string, text: string) => Promise<{ error: string } | null>
}) {
  const router = useRouter()
  const [value, setValue] = useState(notes ?? "")
  const [savedValue, setSavedValue] = useState(notes ?? "")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [tooLong, setTooLong] = useState(false)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const dirty = value !== savedValue

  // Höhe wächst mit dem Text (Paket 13) - bei langen Texten nur bis zur Einklapp-Höhe,
  // außer "Ganz anzeigen" ist an (Paket 67).
  useLayoutEffect(() => {
    const el = textarea.current
    if (!el) return
    el.style.height = "auto"
    const full = el.scrollHeight + 2
    const collapse = full > DESCRIPTION_COLLAPSED_PX && !expanded
    el.style.height = `${collapse ? DESCRIPTION_COLLAPSED_PX : full}px`
    el.style.overflowY = collapse ? "auto" : "hidden"
    setTooLong(full > DESCRIPTION_COLLAPSED_PX)
  }, [value, expanded])

  function handleSave() {
    if (!dirty || pending) return
    setError(null)
    const text = value
    startTransition(async () => {
      const result = await save(candidateId, text)
      if (result?.error) {
        setError(result.error)
        return
      }
      setSavedValue(text)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 2000)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      {/* Speichern oben (Paket 67) - bei langen Texten kein Scrollen bis ans Ende. */}
      <div className="mb-2 flex min-h-[30px] items-center justify-between gap-2">
        <label className="block text-sm font-semibold text-gray-700">{label}</label>
        <div className="flex items-center gap-1.5">
          <CopyButton value={value} />
          {dirty || pending ? (
            <button
              type="button"
              onClick={handleSave}
              disabled={pending}
              title="Speichern (Strg/Cmd + Enter)"
              className="rounded-md px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              {pending ? "Speichert…" : "Speichern"}
            </button>
          ) : (
            justSaved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                <Check size={13} /> Gespeichert
              </span>
            )
          )}
        </div>
      </div>
      {error && <p className="mb-1 text-xs text-red-600">{error}</p>}
      <textarea
        ref={textarea}
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            handleSave()
          }
        }}
        className="w-full resize-none overflow-hidden rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        style={{ borderColor: dirty ? "#93b4dc" : "#dde3ea" }}
        placeholder={placeholder}
      />
      {tooLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: "#1e56a0" }}
        >
          <ChevronDown size={13} className={expanded ? "rotate-180" : undefined} />
          {expanded ? "Einklappen" : "Ganz anzeigen"}
        </button>
      )}
    </div>
  )
}

// "Weitere Aktionen" (Paket 64): seltene und gefährliche Aktionen aus der Kopfzeile -
// Löschen fragt danach wie bisher im Dialog nach.
function MoreActionsMenu({ onDelete }: { onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Weitere Aktionen"
        aria-expanded={open}
        title="Weitere Aktionen"
        className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border bg-white text-gray-600 hover:bg-gray-50"
        style={{ borderColor: "#dde3ea" }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[1299]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-[1300] mt-1 w-52 overflow-hidden rounded-lg border bg-white py-1 shadow-lg" style={{ borderColor: "#dde3ea" }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-red-50"
              style={{ color: "#dc2626" }}
            >
              <Trash2 size={14} /> Kandidat löschen
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function initialsOf(first: string | null, last: string | null): string {
  return `${(first ?? "").trim().charAt(0)}${(last ?? "").trim().charAt(0)}`.toUpperCase() || "?"
}

// "KS24 - Video Neele - Region …" -> "Video Neele - Region …" (wie in der Kandidatenliste).
function shortCampaignTitle(title: string): string {
  return title.replace(/^\s*ks[\s-]?24\s*[-–|:]\s*/i, "")
}

// Eintrag in der Kontakt-/Herkunftszeile des Kopfs (Paket 69).
function MetaItem({ icon: Icon, title, children }: { icon: LucideIcon; title?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-sm text-gray-600 sm:max-w-[26rem]" title={title}>
      <Icon size={14} className="shrink-0 text-gray-400" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  )
}

// Status als Pille mit Menü (Paket 69) - so breit wie der Text, nicht wie die längste Option.
function StatusMenu({ value, pending, onChange }: { value: string; pending: boolean; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const current = STATUS_COLORS[value] ?? CANDIDATE_STATUS_FALLBACK_COLORS
  const label = STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Status ändern"
        className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 text-sm font-medium disabled:opacity-60"
        style={{ backgroundColor: current.bg, color: current.text }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current.dot }} />
        {label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[1299]" onClick={() => setOpen(false)} aria-hidden />
          <ul role="listbox" className="absolute left-0 z-[1300] mt-1 w-60 rounded-lg border bg-white py-1 shadow-lg" style={{ borderColor: "#dde3ea" }}>
            {STATUS_OPTIONS.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => {
                    setOpen(false)
                    if (o.value !== value) onChange(o.value)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-800 hover:bg-gray-50"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.dot }} />
                  <span className="flex-1">{o.label}</span>
                  {o.value === value && <Check size={14} className="text-gray-500" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
