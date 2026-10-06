"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Send } from "lucide-react"
import { substituteTemplateVars, type TemplateVars } from "@/lib/automation-engine"
import { sendCandidateEmailAction } from "./communication-actions"

export interface CandidateMessage {
  id: string
  channel: string
  toAddress: string
  subject: string | null
  body: string
  senderName: string | null
  status: string
  error: string | null
  createdAt: string
}

export interface MessageTemplate {
  id: string
  name: string
  subject: string
  body: string
}

const input = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"

// Reiter "Kommunikation" (Paket 18, T-84): E-Mail an den Kandidaten, z.B. wenn er nicht
// erreicht wurde. Vorlagen = Automatisierungs-Vorlagen an "Kandidat"; Platzhalter werden
// beim Auswählen ersetzt, damit man den fertigen Text vor dem Senden sieht.
export function CommunicationTab({
  candidateId,
  email,
  isDemo,
  vars,
  templates,
  messages,
}: {
  candidateId: string
  email: string | null
  isDemo: boolean
  vars: TemplateVars
  templates: MessageTemplate[]
  messages: CandidateMessage[]
}) {
  const router = useRouter()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [openId, setOpenId] = useState<string | null>(null)

  function pickTemplate(id: string) {
    const tpl = templates.find((t) => t.id === id)
    if (!tpl) return
    setSubject(substituteTemplateVars(tpl.subject, vars))
    setBody(substituteTemplateVars(tpl.body, vars))
    setResult(null)
  }

  function send() {
    setResult(null)
    startTransition(async () => {
      const res = await sendCandidateEmailAction(candidateId, { subject, body })
      if (res?.error) return setResult({ ok: false, text: res.error })
      setSubject("")
      setBody("")
      setResult({ ok: true, text: "E-Mail verschickt." })
      router.refresh()
    })
  }

  const disabled = !email || isDemo

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">E-Mail an den Kandidaten</h3>
          <span className="text-xs text-gray-500">An: {email || "keine E-Mail-Adresse hinterlegt"}</span>
        </div>
        {isDemo && <p className="text-xs" style={{ color: "#b45309" }}>An den Beispiel-Lead werden keine Mails verschickt.</p>}
        {templates.length > 0 && (
          <select className={input} style={{ borderColor: "#dde3ea" }} defaultValue="" onChange={(e) => pickTemplate(e.target.value)} disabled={disabled}>
            <option value="">Vorlage wählen (optional)…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        <input className={input} style={{ borderColor: "#dde3ea" }} placeholder="Betreff" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={disabled} />
        <textarea className={input} style={{ borderColor: "#dde3ea" }} rows={8} placeholder="Text" value={body} onChange={(e) => setBody(e.target.value)} disabled={disabled} />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={send}
            disabled={disabled || pending || !subject.trim() || !body.trim()}
            className="inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <Send size={14} />
            {pending ? "Wird gesendet…" : "Senden"}
          </button>
          <span className="text-xs text-gray-400">Absender: info@kanzleistelle24.de mit deinem Namen – Antworten gehen an deine E-Mail-Adresse.</span>
        </div>
        {result && <p className="text-xs" style={{ color: result.ok ? "#1a9a6a" : "#dc2626" }}>{result.text}</p>}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: "#eef2f6" }}>
        <h3 className="text-sm font-semibold text-gray-900">Verschickt ({messages.length})</h3>
        {messages.length === 0 && <p className="text-sm text-gray-400">Noch keine Nachrichten.</p>}
        {messages.map((m) => (
          <div key={m.id} className="rounded-lg border px-3 py-2" style={{ borderColor: m.status === "fehler" ? "#fca5a5" : "#dde3ea" }}>
            <button type="button" onClick={() => setOpenId(openId === m.id ? null : m.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
              <span className="text-sm font-medium text-gray-900">{m.subject || "(ohne Betreff)"}</span>
              <span className="text-xs text-gray-500">
                {new Date(m.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" })}
                {m.senderName ? ` · ${m.senderName}` : ""}
                {m.status === "fehler" ? " · fehlgeschlagen" : ""}
              </span>
            </button>
            {openId === m.id && (
              <div className="mt-2 border-t pt-2" style={{ borderColor: "#eef2f6" }}>
                <p className="text-xs text-gray-500">An {m.toAddress}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{m.body}</p>
                {m.error && <p className="mt-1 text-xs text-red-600">{m.error}</p>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
