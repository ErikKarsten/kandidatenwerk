"use client"

import { useTransition } from "react"
import { updateCandidateStatusAction } from "@/app/dashboard/candidates/actions"
import { CANDIDATE_STATUS_OPTIONS, CANDIDATE_STATUS_FALLBACK_COLORS } from "@/lib/candidate-status"

const STATUS_OPTIONS = CANDIDATE_STATUS_OPTIONS
const STATUS_COLORS = Object.fromEntries(CANDIDATE_STATUS_OPTIONS.map((o) => [o.value, o]))

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
  const colors = STATUS_COLORS[currentStatus] ?? CANDIDATE_STATUS_FALLBACK_COLORS

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
