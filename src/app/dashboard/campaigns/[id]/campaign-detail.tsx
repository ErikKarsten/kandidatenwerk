"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronLeft, Plus, Pencil, LayoutGrid, List } from "lucide-react"
import {
  updateCampaignTitleAction,
  archiveCampaignAction,
  deleteCampaignAction,
  deleteCampaignWithCandidatesAction,
  getCampaignCandidatesForExport,
} from "./actions"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CandidateStatusSelect } from "./candidate-status-select"
import { SettingsTab } from "./settings-tab"
import { AutomationsTab, type Automation } from "./automations-tab"
import { PaginationBar, usePaginatedList } from "@/components/ui/pagination-bar"

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
  Archiviert: "Archiviert",
}

const CAMPAIGN_STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  active: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  completed: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
  Archiviert: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
}

const CANDIDATE_STATUS_LABEL: Record<string, string> = {
  neu: "Neu",
  pruefung: "In Prüfung",
  interview: "Interview",
  vorgestellt: "Vorgestellt",
  platziert: "Platziert",
  abgelehnt: "Abgelehnt",
}

const CANDIDATE_STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  neu: { bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  pruefung: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  interview: { bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  vorgestellt: { bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  platziert: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  abgelehnt: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

const FALLBACK_CANDIDATE_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }

const VIEW_STORAGE_KEY = "campaigns_candidates_view"

interface Candidate {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  status: string
  created_at: string
}

interface Campaign {
  id: string
  title: string
  description: string | null
  status: string
  meta_campaign_id: string | null
  meta_form_id: string | null
  meta_field_mapping: string[] | null
  client: { name: string } | null
}

interface CampaignDetailProps {
  campaign: Campaign
  candidates: Candidate[]
  automations: Automation[]
}

type ModalStep = null | "choice" | "delete_options"
type CandidateOption = "export_delete" | "delete_all" | "keep"

function generateCSV(
  candidates: Array<{ first_name: string; last_name: string; email: string | null; phone: string | null; status: string; custom_fields: Record<string, string> | null }>
): string {
  const customKeys = [...new Set(candidates.flatMap((c) => Object.keys(c.custom_fields ?? {})))].sort()
  const headers = ["Vorname", "Nachname", "E-Mail", "Telefon", "Status", ...customKeys]
  const rows = candidates.map((c) => [
    c.first_name, c.last_name, c.email ?? "", c.phone ?? "", c.status,
    ...customKeys.map((k) => String(c.custom_fields?.[k] ?? "")),
  ])
  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n")
}

function triggerCSVDownload(csv: string, filename: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function CampaignDetail({ campaign, candidates, automations }: CampaignDetailProps) {
  const [tab, setTab] = useState<"kandidaten" | "einrichtung" | "automatisierungen">("kandidaten")
  const [modalStep, setModalStep] = useState<ModalStep>(null)
  const [selectedOption, setSelectedOption] = useState<CandidateOption | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [archivePending, startArchiveTransition] = useTransition()
  const [finalDeletePending, setFinalDeletePending] = useState(false)
  const statusColors = CAMPAIGN_STATUS_COLORS[campaign.status] ?? CAMPAIGN_STATUS_COLORS.completed

  const [view, setView] = useState<"table" | "grid">("table")
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored === "grid" || stored === "table") setView(stored)
  }, [])

  function handleViewChange(v: "table" | "grid") {
    setView(v)
    window.localStorage.setItem(VIEW_STORAGE_KEY, v)
  }

  const { visible, page, totalPages, pageSize, setPage, handlePageSize } = usePaginatedList(
    candidates,
    "campaigns_candidates_page_size"
  )

  function openModal() {
    setModalStep("choice")
    setSelectedOption(null)
    setModalError(null)
  }

  function closeModal() {
    setModalStep(null)
    setSelectedOption(null)
    setModalError(null)
  }

  function handleArchive() {
    startArchiveTransition(async () => {
      const result = await archiveCampaignAction(campaign.id)
      if (result?.error) setModalError(result.error)
    })
  }

  async function handleFinalDelete() {
    if (!selectedOption || finalDeletePending) return
    setFinalDeletePending(true)
    setModalError(null)

    try {
      if (selectedOption === "export_delete") {
        const result = await getCampaignCandidatesForExport(campaign.id)
        if ("error" in result) { setModalError(result.error); setFinalDeletePending(false); return }
        const csv = generateCSV(result.candidates)
        triggerCSVDownload(csv, `kandidaten-${campaign.title.replace(/[^a-z0-9]/gi, "_")}.csv`)
        await new Promise((r) => setTimeout(r, 400))
        await deleteCampaignWithCandidatesAction(campaign.id)
      } else if (selectedOption === "delete_all") {
        await deleteCampaignWithCandidatesAction(campaign.id)
      } else {
        await deleteCampaignAction(campaign.id)
      }
    } catch {
      // redirect() throws NEXT_REDIRECT — expected on success
    }
  }

  const anyPending = archivePending || finalDeletePending

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>

      {/* ── Modal ── */}
      {modalStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white shadow-xl" style={{ borderColor: "#dde3ea" }}>

            {/* Step 1: Choice */}
            {modalStep === "choice" && (
              <div className="p-6 flex flex-col gap-4">
                <h2 className="text-base font-semibold text-gray-900">Wie möchten Sie fortfahren?</h2>

                <div className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: "#dde3ea" }}>
                  <div>
                    <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}>
                      Empfohlen
                    </span>
                    <p className="text-sm font-semibold text-gray-900">Archivieren</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Kampagne wird aus der normalen Ansicht ausgeblendet. Kandidaten und Einstellungen bleiben vollständig erhalten.
                    </p>
                  </div>
                  <button
                    onClick={handleArchive}
                    disabled={anyPending}
                    className="self-start rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    style={{ borderColor: "#dde3ea" }}
                  >
                    {archivePending ? "Wird archiviert…" : "Archivieren"}
                  </button>
                </div>

                <div className="rounded-lg border p-4 flex flex-col gap-3" style={{ borderColor: "#fca5a5" }}>
                  <div>
                    <span className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#dc262618", color: "#dc2626" }}>
                      Destruktiv
                    </span>
                    <p className="text-sm font-semibold text-gray-900">Endgültig löschen</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Kampagne wird dauerhaft entfernt. Was mit den Kandidaten passiert, wählen Sie im nächsten Schritt.
                    </p>
                  </div>
                  <button
                    onClick={() => { setModalStep("delete_options"); setModalError(null) }}
                    disabled={anyPending}
                    className="self-start rounded-md border px-4 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    style={{ borderColor: "#fca5a5", color: "#dc2626" }}
                  >
                    Endgültig löschen →
                  </button>
                </div>

                {modalError && <p className="text-xs text-red-600">{modalError}</p>}
                <button onClick={closeModal} className="self-start text-sm text-gray-500 hover:text-gray-700">Abbrechen</button>
              </div>
            )}

            {/* Step 2: Candidate options */}
            {modalStep === "delete_options" && (
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Was soll mit den Kandidaten passieren?</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {candidates.length} Kandidat{candidates.length !== 1 ? "en" : ""} betroffen
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  {(
                    [
                      {
                        value: "export_delete" as CandidateOption,
                        label: "Exportieren & löschen",
                        desc: "CSV mit Name, E-Mail, Telefon und Custom-Feldern wird heruntergeladen. Anschließend werden Kandidaten und Kampagne gelöscht.",
                      },
                      {
                        value: "delete_all" as CandidateOption,
                        label: "Kandidaten mit löschen",
                        desc: "Alle Kandidaten werden zusammen mit der Kampagne unwiderruflich gelöscht. Kein Export.",
                      },
                      {
                        value: "keep" as CandidateOption,
                        label: "Kandidaten behalten",
                        desc: "Kandidaten bleiben erhalten, werden aber keiner Kampagne mehr zugeordnet.",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50"
                      style={{ borderColor: selectedOption === opt.value ? "#1e56a0" : "#dde3ea" }}
                    >
                      <input
                        type="radio"
                        name="candidate_option"
                        value={opt.value}
                        checked={selectedOption === opt.value}
                        onChange={() => setSelectedOption(opt.value)}
                        className="mt-0.5 shrink-0 accent-[#1e56a0]"
                      />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {modalError && <p className="text-xs text-red-600">{modalError}</p>}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleFinalDelete}
                    disabled={!selectedOption || finalDeletePending}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    {finalDeletePending
                      ? selectedOption === "export_delete" ? "Exportiert…" : "Wird gelöscht…"
                      : "Endgültig löschen"}
                  </button>
                  <button
                    onClick={() => { setModalStep("choice"); setModalError(null) }}
                    disabled={finalDeletePending}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    ← Zurück
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <Link
          href="/dashboard/campaigns"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft size={16} />
          Zurück zur Übersicht
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <InlineTitle campaignId={campaign.id} title={campaign.title} />
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                style={{ backgroundColor: statusColors.bg, color: statusColors.text }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColors.dot }} />
                {CAMPAIGN_STATUS_LABEL[campaign.status] ?? campaign.status}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {campaign.client?.name ?? "Kein Kunde"}
              {campaign.meta_campaign_id ? ` · Meta-ID: ${campaign.meta_campaign_id}` : ""}
            </p>
            {campaign.description && (
              <p className="mt-1 text-sm text-gray-600">{campaign.description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setModalStep("choice"); setModalError(null) }}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-red-50"
              style={{ borderColor: "#fca5a5", color: "#dc2626" }}
            >
              Löschen
            </button>
            <Button asChild style={{ backgroundColor: "#1e56a0" }}>
              <Link href={`/dashboard/candidates/new?campaign_id=${campaign.id}`}>
                <Plus size={16} />
                Kandidat anlegen
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Tab-Bar */}
      <div className="flex gap-0 border-b" style={{ borderColor: "#dde3ea" }}>
        <TabButton active={tab === "kandidaten"} onClick={() => setTab("kandidaten")}>
          Kandidaten{" "}
          <span className="ml-1 text-xs font-normal" style={{ opacity: 0.7 }}>
            ({candidates.length})
          </span>
        </TabButton>
        <TabButton active={tab === "einrichtung"} onClick={() => setTab("einrichtung")}>
          Einrichtung
        </TabButton>
        <TabButton active={tab === "automatisierungen"} onClick={() => setTab("automatisierungen")}>
          Automatisierungen{" "}
          {automations.length > 0 && (
            <span className="ml-1 text-xs font-normal" style={{ opacity: 0.7 }}>
              ({automations.length})
            </span>
          )}
        </TabButton>
      </div>

      {/* Kandidaten-Tab */}
      {tab === "kandidaten" && (
        <div className="flex flex-col gap-4">
          {/* Tab-header: count + view toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {candidates.length} Kandidat{candidates.length !== 1 ? "en" : ""}
            </span>
            <div className="flex items-center gap-1 rounded-lg border p-0.5" style={{ borderColor: "#dde3ea" }}>
              <button
                onClick={() => handleViewChange("table")}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: view === "table" ? "#1e56a0" : "transparent",
                  color: view === "table" ? "white" : "#6b7280",
                }}
                aria-label="Tabellenansicht"
              >
                <List size={13} />
                Tabelle
              </button>
              <button
                onClick={() => handleViewChange("grid")}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: view === "grid" ? "#1e56a0" : "transparent",
                  color: view === "grid" ? "white" : "#6b7280",
                }}
                aria-label="Kachelansicht"
              >
                <LayoutGrid size={13} />
                Kacheln
              </button>
            </div>
          </div>

          {candidates.length === 0 ? (
            <div
              className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400"
              style={{ borderColor: "#dde3ea" }}
            >
              Noch keine Kandidaten in dieser Kampagne.{" "}
              <Link href={`/dashboard/candidates/new?campaign_id=${campaign.id}`} style={{ color: "#1e56a0" }} className="hover:underline">
                Ersten Kandidaten anlegen
              </Link>
            </div>
          ) : (
            <>
              {/* Table view */}
              {view === "table" && (
                <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: "#dde3ea" }}>
                  <Table>
                    <TableHeader>
                      <TableRow style={{ borderColor: "#dde3ea" }}>
                        <TableHead className="text-gray-600">Name</TableHead>
                        <TableHead className="text-gray-600">Status</TableHead>
                        <TableHead className="text-gray-600">E-Mail</TableHead>
                        <TableHead className="text-gray-600">Telefon</TableHead>
                        <TableHead className="text-gray-600">Erstellt am</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((c) => (
                        <TableRow key={c.id} style={{ borderColor: "#dde3ea" }}>
                          <TableCell className="font-medium">
                            <Link href={`/dashboard/candidates/${c.id}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                              {c.first_name} {c.last_name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <CandidateStatusSelect candidateId={c.id} campaignId={campaign.id} currentStatus={c.status} />
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {c.email ? <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.email}</a> : "—"}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {c.phone ? <a href={`tel:${c.phone}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.phone}</a> : "—"}
                          </TableCell>
                          <TableCell className="text-gray-500 text-sm">
                            {new Date(c.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Grid view */}
              {view === "grid" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {visible.map((c) => {
                    const colors = CANDIDATE_STATUS_COLORS[c.status] ?? FALLBACK_CANDIDATE_COLORS
                    return (
                      <div
                        key={c.id}
                        className="flex flex-col gap-3 rounded-xl border bg-white p-4"
                        style={{ borderColor: "#dde3ea" }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/dashboard/candidates/${c.id}`}
                            className="text-sm font-semibold leading-snug hover:underline"
                            style={{ color: "#1e56a0" }}
                          >
                            {c.first_name} {c.last_name}
                          </Link>
                          <span
                            className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: colors.bg, color: colors.text }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                            {CANDIDATE_STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-gray-500">
                          {c.email ? (
                            <a href={`mailto:${c.email}`} className="truncate hover:underline" style={{ color: "#1e56a0" }}>{c.email}</a>
                          ) : (
                            <span className="text-gray-300">Keine E-Mail</span>
                          )}
                          {c.phone ? (
                            <a href={`tel:${c.phone}`} className="hover:underline" style={{ color: "#1e56a0" }}>{c.phone}</a>
                          ) : (
                            <span className="text-gray-300">Kein Telefon</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(c.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}

              <PaginationBar
                page={page}
                totalPages={totalPages}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={handlePageSize}
              />
            </>
          )}
        </div>
      )}

      {/* Automatisierungen-Tab */}
      {tab === "automatisierungen" && (
        <AutomationsTab campaignId={campaign.id} automations={automations} />
      )}

      {/* Einrichtungs-Tab */}
      {tab === "einrichtung" && (
        <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
          <SettingsTab
            campaignId={campaign.id}
            metaFormId={campaign.meta_form_id}
            metaFieldMapping={campaign.meta_field_mapping}
          />
        </div>
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

function InlineTitle({ campaignId, title }: { campaignId: string; title: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const [pending, startTransition] = useTransition()
  const cancelRef = useRef(false)

  function startEdit() {
    setDraft(title)
    setEditing(true)
  }

  function handleSave() {
    if (cancelRef.current) {
      cancelRef.current = false
      return
    }
    const trimmed = draft.trim()
    if (!trimmed || trimmed === title) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      await updateCampaignTitleAction(campaignId, trimmed)
      router.refresh()
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            cancelRef.current = true
            setEditing(false)
          }
        }}
        disabled={pending}
        className="text-2xl font-bold text-gray-900 bg-transparent border-b-2 focus:outline-none disabled:opacity-50 min-w-0 w-full"
        style={{ borderColor: "#1e56a0" }}
      />
    )
  }

  return (
    <h1
      onClick={startEdit}
      className="group flex cursor-text items-center gap-2 text-2xl font-bold text-gray-900"
    >
      {title}
      <Pencil
        size={14}
        className="shrink-0 opacity-0 transition-opacity group-hover:opacity-30"
      />
    </h1>
  )
}
