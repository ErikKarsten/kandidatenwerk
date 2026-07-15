"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { updateMatchStatusAction } from "@/app/dashboard/matches/actions"
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/candidate-status"

export function MatchStatusSelect({ matchId, currentStatus }: { matchId: string; currentStatus: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const colors = CANDIDATE_STATUS_OPTIONS.find((o) => o.value === currentStatus) ?? CANDIDATE_STATUS_OPTIONS[0]

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status = e.target.value
    startTransition(async () => {
      await updateMatchStatusAction(matchId, status)
      router.refresh()
    })
  }

  return (
    <select
      defaultValue={currentStatus}
      onChange={handleChange}
      disabled={pending}
      className="rounded-full px-2.5 py-1 text-xs font-medium border-0 cursor-pointer focus:outline-none focus:ring-1 disabled:opacity-50"
      style={{ backgroundColor: colors.bg, color: colors.text }}
    >
      {CANDIDATE_STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
