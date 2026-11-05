"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "@/components/app-link"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { CandidatePanel } from "@/components/dashboard/candidate-panel/candidate-panel"
import { useBerufsbilder } from "@/components/berufsbild-context"
import { SOURCE_OPTIONS } from "@/lib/candidate-source"
import { assignmentStatusLabel } from "@/lib/assignment-status"
import { formatRadius } from "@/lib/radius"
import { assignFromMatchingAction, dismissMatchAction, undoDismissMatchAction } from "./actions"

export interface MatchItem {
  candidateId: string
  name: string
  email: string | null
  plz: string | null
  distanceKm: number
  createdAt: string
  source: string
  isNew: boolean
  running: { clientName: string; status: string }[]
}

export interface MatchGroup {
  campaignId: string
  campaignTitle: string
  clientId: string
  clientName: string
  berufsbild: string | null
  plz: string | null
  radiusKm: number
  items: MatchItem[]
}

export interface DismissedMatch {
  candidateId: string
  campaignId: string
  candidateName: string
  campaignTitle: string
  clientName: string | null
  dismissedAt: string
  reason: string | null
  by: string | null
}

const borderStyle = { borderColor: "#dde3ea" }
const COLLAPSED_ROWS = 5

type Done = { kind: "assigned" } | { kind: "dismissed" } | { kind: "error"; message: string }

export function MatchingOverview({ groups, dismissed }: { groups: MatchGroup[]; dismissed: DismissedMatch[] }) {
  const router = useRouter()
  const bb = useBerufsbilder()
  const [tab, setTab] = useState<"offen" | "nicht">("offen")
  const [q, setQ] = useState("")
  const [onlyNew, setOnlyNew] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<Map<string, Done>>(new Map())
  const [asking, setAsking] = useState<string | null>(null)
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ candidateId: string; campaignId: string; campaignTitle: string } | null>(null)
  const [, startTransition] = useTransition()

  const total = groups.reduce((n, g) => n + g.items.length, 0)
  const newCount = groups.reduce((n, g) => n + g.items.filter((i) => i.isNew).length, 0)

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return groups
      .map((g) => {
        const groupHit = !needle || `${g.clientName} ${g.campaignTitle}`.toLowerCase().includes(needle)
        const items = g.items.filter((i) => (!onlyNew || i.isNew) && (groupHit || `${i.name} ${i.email ?? ""} ${i.plz ?? ""}`.toLowerCase().includes(needle)))
        return { ...g, items }
      })
      .filter((g) => g.items.length > 0)
  }, [groups, q, onlyNew])

  const key = (campaignId: string, candidateId: string) => `${campaignId}:${candidateId}`
  const mark = (k: string, d: Done | null) =>
    setDone((prev) => {
      const next = new Map(prev)
      if (d) next.set(k, d)
      else next.delete(k)
      return next
    })

  function run(k: string, action: () => Promise<{ error: string } | null>, onOk: () => void) {
    setBusy(k)
    startTransition(async () => {
      const result = await action()
      setBusy(null)
      if (result?.error) mark(k, { kind: "error", message: result.error })
      else onOk()
    })
  }

  function assign(g: MatchGroup, i: MatchItem) {
    const k = key(g.campaignId, i.candidateId)
    run(k, () => assignFromMatchingAction(g.campaignId, i.candidateId), () => mark(k, { kind: "assigned" }))
  }

  function dismiss(g: MatchGroup, i: MatchItem) {
    const k = key(g.campaignId, i.candidateId)
    run(k, () => dismissMatchAction(g.campaignId, i.candidateId, reason), () => {
      mark(k, { kind: "dismissed" })
      setAsking(null)
      setReason("")
    })
  }

  function undo(campaignId: string, candidateId: string) {
    const k = key(campaignId, candidateId)
    run(k, () => undoDismissMatchAction(campaignId, candidateId), () => {
      mark(k, null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["offen", `Offen (${total})`],
            ["nicht", `Nicht vorgeschlagen (${dismissed.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value)
              if (value === "nicht") router.refresh()
            }}
            className="rounded-md border px-3 py-1.5 text-sm font-medium"
            style={tab === value ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "#fff" } : { ...borderStyle, backgroundColor: "#fff", color: "#374151" }}
          >
            {label}
          </button>
        ))}
        {tab === "offen" && (
          <>
            <div className="relative ml-auto">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Kanzlei, Kampagne oder Kandidat"
                className="w-64 rounded-md border bg-white py-1.5 pl-8 pr-2.5 text-sm focus:outline-none focus:ring-1"
                style={borderStyle}
              />
            </div>
            <label className="flex items-center gap-1.5 text-sm text-gray-600">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-[#1e56a0]" />
              Nur neue ({newCount})
            </label>
          </>
        )}
      </div>

      {tab === "offen" && visible.length === 0 && (
        <div className="rounded-xl border bg-white p-6 text-sm text-gray-400" style={borderStyle}>
          {total === 0 ? "Aktuell keine offenen Vorschläge." : "Keine Treffer für diese Auswahl."}
        </div>
      )}

      {tab === "offen" &&
        visible.map((g) => {
          const open = expanded.has(g.campaignId) || g.items.length <= COLLAPSED_ROWS + 1
          const rows = open ? g.items : g.items.slice(0, COLLAPSED_ROWS)
          const groupNew = g.items.filter((i) => i.isNew).length
          return (
            <div key={g.campaignId} className="overflow-x-auto rounded-xl border bg-white" style={borderStyle}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "#eef2f6" }}>
                <div>
                  <Link href={`/dashboard/campaigns/${g.campaignId}`} className="font-semibold hover:underline" style={{ color: "#1e56a0" }}>
                    {g.clientName} – {g.campaignTitle}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {bb.label(g.berufsbild) ?? "ohne Berufsbild"} · {g.plz ?? "ohne PLZ"} · Umkreis {formatRadius(g.radiusKm)}
                  </div>
                </div>
                <span className="text-xs text-gray-500">
                  {g.items.length} {g.items.length === 1 ? "Vorschlag" : "Vorschläge"}
                  {groupNew > 0 ? ` · ${groupNew} neu` : ""}
                </span>
              </div>
              <table className="w-full min-w-[760px] text-sm">
                <tbody>
                  {rows.map((i) => {
                    const k = key(g.campaignId, i.candidateId)
                    const state = done.get(k)
                    return (
                      <tr key={k} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => setSelected({ candidateId: i.candidateId, campaignId: g.campaignId, campaignTitle: g.campaignTitle })}
                            className="text-left font-medium hover:underline"
                            style={{ color: "#1e56a0" }}
                          >
                            {i.name}
                          </button>
                          {i.isNew && (
                            <span className="ml-2 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#4ba3c318", color: "#0e7490" }}>
                              Neu
                            </span>
                          )}
                          {i.email && <div className="text-xs text-gray-400">{i.email}</div>}
                          {i.running.length > 0 && (
                            <div className="text-xs text-gray-500">
                              Läuft bei: {i.running.map((r) => `${r.clientName} (${assignmentStatusLabel(r.status).label})`).join(", ")}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{i.plz ?? "—"}</td>
                        <td className="px-4 py-2.5 text-gray-600">{Math.round(i.distanceKm)} km</td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {new Date(i.createdAt).toLocaleDateString("de-DE")}
                          <div className="text-xs text-gray-400">{SOURCE_OPTIONS.find((o) => o.value === i.source)?.label ?? i.source}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {state?.kind === "assigned" ? (
                            <span className="text-xs font-medium" style={{ color: "#1a9a6a" }}>Zugeordnet</span>
                          ) : state?.kind === "dismissed" ? (
                            <span className="text-xs text-gray-500">
                              Nicht vorgeschlagen ·{" "}
                              <button type="button" onClick={() => undo(g.campaignId, i.candidateId)} className="underline" disabled={busy === k}>
                                Rückgängig
                              </button>
                            </span>
                          ) : asking === k ? (
                            <div className="flex items-center justify-end gap-2">
                              <input
                                autoFocus
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && dismiss(g, i)}
                                placeholder="Grund (optional)"
                                className="w-44 rounded-md border px-2 py-1 text-xs focus:outline-none focus:ring-1"
                                style={borderStyle}
                              />
                              <button
                                type="button"
                                disabled={busy === k}
                                onClick={() => dismiss(g, i)}
                                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                style={{ backgroundColor: "#6b7280" }}
                              >
                                {busy === k ? "…" : "Nicht vorschlagen"}
                              </button>
                              <button type="button" onClick={() => { setAsking(null); setReason("") }} className="text-xs text-gray-500 hover:underline">
                                Abbrechen
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-2">
                              {state?.kind === "error" && <span className="max-w-56 text-xs text-red-600">{state.message}</span>}
                              <button
                                type="button"
                                disabled={busy === k}
                                onClick={() => { setAsking(k); setReason("") }}
                                className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                style={borderStyle}
                              >
                                Nicht vorschlagen
                              </button>
                              <button
                                type="button"
                                disabled={busy === k}
                                onClick={() => assign(g, i)}
                                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                style={{ backgroundColor: "#1e56a0" }}
                              >
                                {busy === k ? "…" : "Zuordnen"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!open && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => new Set(prev).add(g.campaignId))}
                  className="w-full border-t px-4 py-2 text-left text-xs font-medium hover:bg-gray-50"
                  style={{ borderColor: "#eef2f6", color: "#1e56a0" }}
                >
                  Alle {g.items.length} anzeigen
                </button>
              )}
            </div>
          )
        })}

      {tab === "nicht" && (
        <div className="overflow-x-auto rounded-xl border bg-white" style={borderStyle}>
          {dismissed.length === 0 ? (
            <p className="p-6 text-sm text-gray-400">Noch niemand wurde „nicht vorgeschlagen“.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                  <th className="px-4 py-2 font-medium">Kandidat</th>
                  <th className="px-4 py-2 font-medium">Kampagne</th>
                  <th className="px-4 py-2 font-medium">Grund</th>
                  <th className="px-4 py-2 font-medium">Wann / wer</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {dismissed.map((d) => {
                  const k = key(d.campaignId, d.candidateId)
                  return (
                    <tr key={k} className="border-b last:border-0" style={{ borderColor: "#eef2f6" }}>
                      <td className="px-4 py-2.5">
                        <Link href={`/dashboard/candidates/${d.candidateId}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                          {d.candidateName}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {d.clientName ? `${d.clientName} – ` : ""}
                        {d.campaignTitle}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{d.reason ?? "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {new Date(d.dismissedAt).toLocaleDateString("de-DE")}
                        {d.by && <div className="text-xs text-gray-400">{d.by}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          disabled={busy === k}
                          onClick={() => undo(d.campaignId, d.candidateId)}
                          className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          style={borderStyle}
                        >
                          {busy === k ? "…" : "Rückgängig"}
                        </button>
                        {done.get(k)?.kind === "error" && <div className="text-xs text-red-600">{(done.get(k) as { message: string }).message}</div>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selected && (
        <CandidatePanel
          candidateId={selected.candidateId}
          onClose={() => setSelected(null)}
          campaign={{ id: selected.campaignId, title: selected.campaignTitle }}
          onAssigned={(id) => mark(key(selected.campaignId, id), { kind: "assigned" })}
        />
      )}
    </div>
  )
}
