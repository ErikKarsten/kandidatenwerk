"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { RefreshCw } from "lucide-react"
import { triggerLeadtableSyncAction, getLatestLeadtableSyncRunAction, type LeadtableSyncRunSummary } from "./actions"

const POLL_INTERVAL_MS = 10_000
const START_TIMEOUT_MS = 2 * 60 * 1000

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string; pulse?: boolean }> = {
  success: { bg: "#1a9a6a18", text: "#1a9a6a", label: "Erfolgreich" },
  failed: { bg: "#dc262618", text: "#dc2626", label: "Fehlgeschlagen" },
  running: { bg: "#1e56a018", text: "#1e56a0", label: "Läuft", pulse: true },
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 1) return "gerade eben"
  if (diffMin < 60) return `vor ${diffMin} Minute${diffMin === 1 ? "" : "n"}`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `vor ${diffH} Stunde${diffH === 1 ? "" : "n"}`
  const diffD = Math.round(diffH / 24)
  return `vor ${diffD} Tag${diffD === 1 ? "" : "en"}`
}

function summaryText(summary: LeadtableSyncRunSummary["summary"]): string {
  if (!summary) return ""
  const parts: string[] = []
  if (summary.newCandidates) parts.push(`${summary.newCandidates} neue Kandidaten`)
  if (summary.statusUpdated) parts.push(`${summary.statusUpdated} Status aktualisiert`)
  if (summary.descriptionsAdded) parts.push(`${summary.descriptionsAdded} Beschreibungen ergänzt`)
  if (summary.fieldsAdded) parts.push(`${summary.fieldsAdded} Zusatzfelder ergänzt`)
  return parts.length > 0 ? parts.join(", ") : "Keine Änderungen"
}

export function LeadtableSyncStatus({ initialRun }: { initialRun: LeadtableSyncRunSummary | null }) {
  const [run, setRun] = useState<LeadtableSyncRunSummary | null>(initialRun)
  const [starting, setStarting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [triggerError, setTriggerError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const clickedAtRef = useRef<number | null>(null)

  const isRunning = run?.status === "running"

  useEffect(() => {
    if (!isRunning && !starting) return

    const interval = setInterval(async () => {
      const latest = await getLatestLeadtableSyncRunAction()
      if (latest) setRun(latest)

      const nowRunning = latest?.status === "running"
      if (nowRunning) {
        setStarting(false)
        setTimedOut(false)
      } else if (
        starting &&
        clickedAtRef.current &&
        Date.now() - clickedAtRef.current > START_TIMEOUT_MS
      ) {
        setStarting(false)
        setTimedOut(true)
      }
    }, POLL_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isRunning, starting])

  function handleTrigger() {
    setTriggerError(null)
    setTimedOut(false)
    clickedAtRef.current = Date.now()
    setStarting(true)
    startTransition(async () => {
      const result = await triggerLeadtableSyncAction()
      if (!result.success) {
        setStarting(false)
        setTriggerError(result.error)
      }
      // bei Erfolg bleibt "starting" aktiv - das Polling erkennt den neuen
      // running-Eintrag, sobald GitHub Actions den Lauf tatsächlich gestartet hat.
    })
  }

  const badge = run ? STATUS_BADGE[run.status] ?? STATUS_BADGE.failed : null
  const buttonDisabled = isRunning || starting || pending

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-700">Leadtable-Sync</p>

          {run ? (
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: badge!.bg, color: badge!.text }}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${badge!.pulse ? "animate-pulse" : ""}`}
                  style={{ backgroundColor: badge!.text }}
                />
                {badge!.label}
              </span>
              <span className="text-xs text-gray-400">
                Letzter Sync:{" "}
                {formatRelativeTime(run.status === "running" ? run.started_at : run.finished_at ?? run.started_at)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Noch kein Sync-Lauf vorhanden</p>
          )}

          {run?.status === "success" && (
            <p className="mt-1.5 text-xs text-gray-600">{summaryText(run.summary)}</p>
          )}
          {run?.status === "failed" && run.error_message && (
            <p className="mt-1.5 text-xs text-red-600">{run.error_message}</p>
          )}
          {timedOut && (
            <p className="mt-1.5 text-xs" style={{ color: "#b45309" }}>
              Dauert länger als erwartet, prüf später nochmal nach.
            </p>
          )}
          {triggerError && <p className="mt-1.5 text-xs text-red-600">{triggerError}</p>}
        </div>

        <button
          type="button"
          onClick={handleTrigger}
          disabled={buttonDisabled}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent"
          style={{ borderColor: "#dde3ea", color: "#1e56a0" }}
        >
          <RefreshCw size={12} className={buttonDisabled ? "animate-spin" : undefined} />
          {isRunning ? "Sync läuft…" : starting || pending ? "Wird gestartet…" : "Jetzt synchronisieren"}
        </button>
      </div>
    </div>
  )
}
