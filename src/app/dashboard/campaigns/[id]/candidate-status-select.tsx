"use client"

import { useTransition } from "react"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"

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

export function CandidateStatusSelect({
  candidateId,
  campaignId,
  currentStatus,
}: {
  candidateId: string
  campaignId: string
  currentStatus: string
}) {
  const [pending, startTransition] = useTransition()
  const colors = STATUS_COLORS[currentStatus] ?? STATUS_COLORS.rejected

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    startTransition(() => {
      updateCandidateStatusAction(candidateId, newStatus, campaignId)
    })
  }

  return (
    <select
      defaultValue={currentStatus}
      onChange={handleChange}
      disabled={pending}
      className="rounded-full px-2 py-0.5 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}
