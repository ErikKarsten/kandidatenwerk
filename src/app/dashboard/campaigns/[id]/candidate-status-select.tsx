"use client"

import { useTransition } from "react"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"

const STATUS_OPTIONS = [
  { value: "neu", label: "Neu" },
  { value: "pruefung", label: "In Prüfung" },
  { value: "interview", label: "Interview" },
  { value: "vorgestellt", label: "Vorgestellt" },
  { value: "platziert", label: "Platziert" },
  { value: "abgelehnt", label: "Abgelehnt" },
]

const STATUS_COLORS: Record<string, { bg: string; dot: string; text: string }> = {
  neu: { bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  pruefung: { bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  interview: { bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  vorgestellt: { bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  platziert: { bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  abgelehnt: { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}
const FALLBACK_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }

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
  const colors = STATUS_COLORS[currentStatus] ?? FALLBACK_COLORS

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    startTransition(() => {
      updateCandidateStatusAction(candidateId, newStatus, campaignId)
    })
  }

  return (
    <span className="relative inline-flex items-center">
      <span
        className="pointer-events-none absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: colors.dot }}
      />
      <select
        defaultValue={currentStatus}
        onChange={handleChange}
        disabled={pending}
        className="appearance-none rounded-full py-0.5 pl-5 pr-2 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
        style={{ backgroundColor: colors.bg, color: colors.text }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </span>
  )
}
