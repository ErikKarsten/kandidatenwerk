"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"
import { saveDescriptionAction, addNoteAction } from "./actions"
import { ProfileTab } from "./profile-tab"
import { FilesTab } from "./files-tab"

const STATUS_OPTIONS = [
  { value: "neu", label: "Neu" },
  { value: "interview", label: "Interview" },
  { value: "vorgestellt", label: "Vorgestellt" },
  { value: "platziert", label: "Platziert" },
  { value: "abgelehnt", label: "Abgelehnt" },
]

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  neu: { bg: "#4ba3c318", text: "#0e7490" },
  interview: { bg: "#1e56a018", text: "#1e56a0" },
  vorgestellt: { bg: "#8b5cf618", text: "#7c3aed" },
  platziert: { bg: "#1a9a6a18", text: "#1a9a6a" },
  abgelehnt: { bg: "#9ca3af18", text: "#6b7280" },
}

const HISTORY_TYPE_LABEL: Record<string, string> = {
  note: "Notiz",
  call: "Anruf",
  email: "E-Mail",
  status_change: "Statusänderung",
  interview: "Interview",
}

interface HistoryEntry {
  id: string
  type: string | null
  content: string | null
  created_at: string
}

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
  notes: string | null
  custom_fields: Record<string, string> | null
  campaign_id: string | null
  campaigns: { title: string; meta_field_mapping?: Record<string, string> | null; clients: { id: string; name: string } | null } | null
}

interface CandidateDetailProps {
  candidate: Candidate
  history: HistoryEntry[]
  files: FileItem[]
  campaignMapping: Record<string, string> | null
}

export function CandidateDetail({ candidate, history, files, campaignMapping }: CandidateDetailProps) {
  const router = useRouter()
  const [statusPending, startStatusTransition] = useTransition()
  const [tab, setTab] = useState<"profil" | "dateien">("profil")

  const colors = STATUS_COLORS[candidate.status] ?? STATUS_COLORS.abgelehnt

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    startStatusTransition(async () => {
      await updateCandidateStatusAction(candidate.id, newStatus, candidate.campaign_id ?? undefined)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <Link
          href="/dashboard/candidates"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Zurück zur Übersicht
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {candidate.first_name} {candidate.last_name}
          </h1>
          <select
            defaultValue={candidate.status}
            onChange={handleStatusChange}
            disabled={statusPending}
            className="rounded-full px-3 py-1 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 disabled:opacity-50"
            style={{ backgroundColor: colors.bg, color: colors.text }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "60% 1fr" }}>
        {/* Linke Spalte */}
        <div className="flex flex-col gap-4">
          {/* Tab-Bar */}
          <div className="flex gap-0 border-b" style={{ borderColor: "#dde3ea" }}>
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
              Dateien
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
                customFields={candidate.custom_fields}
                campaignMapping={campaignMapping}
              />
            )}
            {tab === "dateien" && (
              <FilesTab candidateId={candidate.id} files={files} />
            )}
          </div>
        </div>

        {/* Rechte Spalte */}
        <div className="flex flex-col gap-4">
          <ContactChips email={candidate.email} phone={candidate.phone} />
          <CampaignInfoCard campaignId={candidate.campaign_id} campaigns={candidate.campaigns} />
          <DescriptionSection candidateId={candidate.id} notes={candidate.notes} />
          <NoteSection candidateId={candidate.id} />
          <HistoryList history={history} />
        </div>
      </div>
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

function CampaignInfoCard({
  campaignId,
  campaigns,
}: {
  campaignId: string | null
  campaigns: { title: string; clients: { id: string; name: string } | null } | null
}) {
  if (!campaignId || !campaigns) return null

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Zuordnung</p>
      <dl className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <dt className="shrink-0 text-sm text-gray-500" style={{ minWidth: "5rem" }}>Kampagne</dt>
          <dd className="text-sm">
            <Link
              href={`/dashboard/campaigns/${campaignId}`}
              className="font-medium hover:underline"
              style={{ color: "#1e56a0" }}
            >
              {campaigns.title}
            </Link>
          </dd>
        </div>
        {campaigns.clients && (
          <div className="flex items-start gap-2">
            <dt className="shrink-0 text-sm text-gray-500" style={{ minWidth: "5rem" }}>Kunde</dt>
            <dd className="text-sm">
              <Link
                href={`/dashboard/clients/${campaigns.clients.id}`}
                className="font-medium hover:underline"
                style={{ color: "#1e56a0" }}
              >
                {campaigns.clients.name}
              </Link>
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function ContactChips({
  email,
  phone,
}: {
  email: string | null
  phone: string | null
}) {
  if (!email && !phone) return null

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <div className="flex flex-wrap gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
            style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
          >
            📞 {phone}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-gray-50"
            style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
          >
            ✉ {email}
          </a>
        )}
      </div>
    </div>
  )
}

function DescriptionSection({
  candidateId,
  notes,
}: {
  candidateId: string
  notes: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(notes ?? "")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await saveDescriptionAction(candidateId, value)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <label className="mb-2 block text-sm font-semibold text-gray-700">Beschreibung</label>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        style={{ borderColor: "#dde3ea" }}
        placeholder="Notizen zum Kandidaten…"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={pending}
        className="mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "#1e56a0" }}
      >
        {pending ? "Wird gespeichert…" : "Speichern"}
      </button>
    </div>
  )
}

function NoteSection({ candidateId }: { candidateId: string }) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    if (!value.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await addNoteAction(candidateId, value)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
      setValue("")
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <label className="mb-2 block text-sm font-semibold text-gray-700">Neue Notiz</label>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
        style={{ borderColor: "#dde3ea" }}
        placeholder="Notiz eingeben…"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={pending || !value.trim()}
        className="mt-2 rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "#1e56a0" }}
      >
        {pending ? "Wird gespeichert…" : "Notiz speichern"}
      </button>
    </div>
  )
}

function HistoryList({ history }: { history: HistoryEntry[] }) {
  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <p className="mb-3 text-sm font-semibold text-gray-700">
        Verlauf ({history.length})
      </p>
      {history.length === 0 ? (
        <p className="text-sm text-gray-400">Noch keine Einträge.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {history.map((entry) => {
            const isStatusChange = entry.type === "status_change"
            const dotColor = isStatusChange ? "#1e56a0" : "#9ca3af"
            return (
              <li key={entry.id} className="flex gap-3">
                <div className="mt-1 shrink-0">
                  <span
                    className="block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {new Date(entry.created_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: isStatusChange ? "#1e56a018" : "#9ca3af18",
                        color: isStatusChange ? "#1e56a0" : "#6b7280",
                      }}
                    >
                      {HISTORY_TYPE_LABEL[entry.type ?? ""] ?? entry.type ?? "Eintrag"}
                    </span>
                  </div>
                  {entry.content && (
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{entry.content}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
