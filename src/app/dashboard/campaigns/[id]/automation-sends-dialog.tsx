"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Eye, ExternalLink, Mail, RotateCw, X } from "lucide-react"
import { previewAutomationMailAction, resendAutomationMailAction } from "./actions"
import type { AutomationSend } from "@/lib/automation-sends"

function formatWhen(iso: string): string {
  const d = new Date(iso)
  const tz = "Europe/Berlin"
  const day = (x: Date) => x.toLocaleDateString("de-DE", { timeZone: tz })
  const time = d.toLocaleTimeString("de-DE", { timeZone: tz, hour: "2-digit", minute: "2-digit" })
  const now = new Date()
  if (day(d) === day(now)) return `Heute, ${time}`
  if (day(d) === day(new Date(now.getTime() - 86400e3))) return `Gestern, ${time}`
  return `${d.toLocaleDateString("de-DE", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" })}, ${time}`
}

// "Gesendete E-Mails" einer Automatisierung (Paket 84): wer die Mail wann bekommen hat,
// Vorschau mit den heutigen Angaben und erneut senden (z. B. wenn die Kanzlei sie nicht
// erhalten hat).
export function AutomationSendsDialog({
  automationId,
  automationName,
  sends,
  onClose,
  onResent,
}: {
  automationId: string
  automationName: string
  sends: AutomationSend[]
  onClose: () => void
  onResent: () => void
}) {
  const [preview, setPreview] = useState<{ name: string; subject: string; html: string; recipients: string[] } | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [, startTransition] = useTransition()

  function showPreview(s: AutomationSend) {
    setBusyId(s.candidateId)
    setMessage(null)
    startTransition(async () => {
      const res = await previewAutomationMailAction(automationId, s.candidateId)
      setBusyId(null)
      if ("error" in res) setMessage({ ok: false, text: res.error })
      else setPreview({ name: s.candidateName, ...res })
    })
  }

  function resend(s: AutomationSend) {
    setBusyId(s.candidateId)
    setMessage(null)
    startTransition(async () => {
      const res = await resendAutomationMailAction(automationId, s.candidateId)
      setBusyId(null)
      setConfirmId(null)
      if ("error" in res) setMessage({ ok: false, text: `Nicht verschickt: ${res.error}` })
      else {
        setMessage({ ok: true, text: `Erneut verschickt an ${res.recipients.join(", ")}` })
        onResent()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border bg-white shadow-xl"
        style={{ borderColor: "#dde3ea" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b px-6 py-4" style={{ borderColor: "#dde3ea" }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border" style={{ borderColor: "#dde3ea" }}>
              <Mail size={16} className="text-gray-500" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Gesendete E-Mails</h2>
              <p className="text-xs text-gray-500">
                {automationName} · {sends.length} {sends.length === 1 ? "Mail" : "Mails"}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Schließen">
            <X size={18} />
          </button>
        </div>

        {message && (
          <p className="mx-6 mt-3 rounded-md px-3 py-2 text-xs" style={{ backgroundColor: message.ok ? "#f0fdf4" : "#fef2f2", color: message.ok ? "#15803d" : "#b91c1c" }}>
            {message.text}
          </p>
        )}

        <div className="overflow-auto p-6 pt-3">
          {sends.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Diese Automatisierung hat noch keine Mail verschickt.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Kandidat</th>
                  <th className="px-3 py-2 font-medium">Empfänger</th>
                  <th className="px-3 py-2 font-medium">Gesendet am</th>
                  <th className="px-3 py-2 font-medium">Ausgelöst am</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {sends.map((s) => (
                  <tr key={s.candidateId} className="border-b align-top" style={{ borderColor: "#f1f5f9" }}>
                    <td className="px-3 py-2.5">
                      <span className="whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium" style={{ color: "#15803d", backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }}>
                        {s.sendCount > 1 ? `${s.sendCount}× gesendet` : "Gesendet"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Link href={`/dashboard/candidates/${s.candidateId}`} target="_blank" className="inline-flex items-center gap-1 hover:underline" style={{ color: "#1e56a0" }}>
                        {s.candidateName} <ExternalLink size={12} />
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 [overflow-wrap:anywhere]">{s.recipients.join(", ")}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{formatWhen(s.lastSentAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{formatWhen(s.firedAt)}</td>
                    <td className="px-3 py-2.5">
                      {confirmId === s.candidateId ? (
                        <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-xs">
                          <span className="text-gray-500">Erneut senden?</span>
                          <button
                            type="button"
                            onClick={() => resend(s)}
                            disabled={busyId === s.candidateId}
                            className="rounded px-2 py-0.5 font-medium text-white disabled:opacity-50"
                            style={{ backgroundColor: "#1e56a0" }}
                          >
                            {busyId === s.candidateId ? "…" : "Ja"}
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="rounded border px-2 py-0.5 text-gray-600" style={{ borderColor: "#dde3ea" }}>
                            Nein
                          </button>
                        </span>
                      ) : (
                        <span className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => showPreview(s)}
                            disabled={busyId === s.candidateId}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                            title="Vorschau"
                            aria-label="Vorschau"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmId(s.candidateId)}
                            className="rounded p-1.5 text-gray-500 hover:bg-gray-100"
                            title="Erneut senden"
                            aria-label="Erneut senden"
                          >
                            <RotateCw size={16} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-gray-400">
            „Erneut senden“ schickt die Mail mit der heutigen Vorlage und den heutigen Angaben an die heutigen Empfänger.
          </p>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={(e) => (e.stopPropagation(), setPreview(null))}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b px-5 py-3" style={{ borderColor: "#dde3ea" }}>
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-gray-900">{preview.subject}</p>
                <p className="text-xs text-gray-500">An: {preview.recipients.join(", ") || "kein Empfänger"} · Kandidat: {preview.name}</p>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="rounded p-1 text-gray-400 hover:bg-gray-100" aria-label="Schließen">
                <X size={16} />
              </button>
            </div>
            <iframe title="Vorschau" srcDoc={preview.html} sandbox="" className="h-[70vh] w-full border-0" />
          </div>
        </div>
      )}
    </div>
  )
}
