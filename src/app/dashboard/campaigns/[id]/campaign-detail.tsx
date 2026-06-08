"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronLeft, Plus } from "lucide-react"
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

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  completed: "Abgeschlossen",
}

const CAMPAIGN_STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  active: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  completed: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

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
  meta_field_mapping: Record<string, string> | null
  client: { name: string } | null
}

interface CampaignDetailProps {
  campaign: Campaign
  candidates: Candidate[]
}

export function CampaignDetail({ campaign, candidates }: CampaignDetailProps) {
  const [tab, setTab] = useState<"kandidaten" | "einrichtung">("kandidaten")
  const statusColors = CAMPAIGN_STATUS_COLORS[campaign.status] ?? CAMPAIGN_STATUS_COLORS.completed

  return (
    <div className="flex flex-col gap-8 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
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
              <h1 className="text-2xl font-bold text-gray-900">{campaign.title}</h1>
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

          <Button asChild style={{ backgroundColor: "#1e56a0" }} className="shrink-0">
            <Link href={`/dashboard/candidates/new?campaign_id=${campaign.id}`}>
              <Plus size={16} />
              Kandidat anlegen
            </Link>
          </Button>
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
      </div>

      {/* Kandidaten-Tab */}
      {tab === "kandidaten" && (
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
              {candidates.length > 0 ? (
                candidates.map((c) => (
                  <TableRow key={c.id} style={{ borderColor: "#dde3ea" }}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/dashboard/candidates/${c.id}`}
                        className="hover:underline"
                        style={{ color: "#1e56a0" }}
                      >
                        {c.first_name} {c.last_name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <CandidateStatusSelect
                        candidateId={c.id}
                        campaignId={campaign.id}
                        currentStatus={c.status}
                      />
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                          {c.email}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {c.phone ? (
                        <a href={`tel:${c.phone}`} className="hover:underline" style={{ color: "#1e56a0" }}>
                          {c.phone}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {new Date(c.created_at).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-gray-400">
                    Noch keine Kandidaten in dieser Kampagne.{" "}
                    <Link
                      href={`/dashboard/candidates/new?campaign_id=${campaign.id}`}
                      style={{ color: "#1e56a0" }}
                      className="hover:underline"
                    >
                      Ersten Kandidaten anlegen
                    </Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
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
