"use client"

import { useEffect, useState, useTransition } from "react"
import { PhoneCall } from "lucide-react"
import {
  loadMySipgateAction,
  saveMySipgateDeviceAction,
  setupSipgateWebhookAction,
  sipgateAdminStatusAction,
  type MySipgate,
  type SipgateAdminStatus,
} from "@/app/dashboard/telefonie-actions"

const DEVICE_TYPES: Record<string, string> = { REGISTER: "Telefon/Softphone", MOBILE: "sipgate-App/Handy", EXTERNAL: "Externes Telefon" }

// Telefonie (Paket 92): eigenes sipgate-Telefon für "Anrufen" wählen; Admins verbinden
// zusätzlich die Anruf-Benachrichtigung (Push-API), damit Anrufe im Verlauf landen.
export function TelefonieCard({ isAdmin }: { isAdmin: boolean }) {
  const [mine, setMine] = useState<MySipgate | null>(null)
  const [admin, setAdmin] = useState<SipgateAdminStatus | null>(null)
  const [device, setDevice] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    loadMySipgateAction().then((m) => {
      setMine(m)
      setDevice(m.deviceId ?? "")
    })
    if (isAdmin) sipgateAdminStatusAction().then(setAdmin)
  }, [isAdmin])

  function saveDevice() {
    if (!mine?.sipgateUser || !device) return
    setMessage(null)
    startTransition(async () => {
      const res = await saveMySipgateDeviceAction(mine.sipgateUser!.id, device)
      setMessage(res.ok ? { ok: true, text: "Telefon gespeichert." } : { ok: false, text: res.error })
    })
  }

  function setupWebhook(replace: boolean) {
    setMessage(null)
    startTransition(async () => {
      const res = await setupSipgateWebhookAction(replace)
      if (!res.ok) {
        if (!replace && /andere Webhook/.test(res.error)) setConfirmReplace(true)
        setMessage({ ok: false, text: res.error })
        return
      }
      setConfirmReplace(false)
      setMessage({ ok: true, text: "Anruf-Benachrichtigung eingerichtet. Anrufe mit Kandidaten erscheinen jetzt im Verlauf." })
      setAdmin(await sipgateAdminStatusAction())
    })
  }

  const notConfigured = mine && !mine.configured

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div className="flex items-center gap-2">
        <PhoneCall size={16} style={{ color: "#1a9a6a" }} />
        <h3 className="text-sm font-semibold text-gray-900">Telefonie (sipgate)</h3>
      </div>
      <p className="text-xs text-gray-500">
        Mit „Anrufen“ beim Kandidaten klingelt zuerst dein sipgate-Telefon, nach dem Abnehmen wird der Kandidat angerufen. Nach dem
        Auflegen steht der Anruf im Verlauf.
      </p>

      {mine === null && <p className="text-sm text-gray-400">Wird geladen…</p>}
      {notConfigured && (
        <p className="rounded-md px-3 py-2 text-sm" style={{ backgroundColor: "#fffbeb", color: "#92400e" }}>
          sipgate ist noch nicht verbunden. Dafür braucht es einen Zugangstoken von sipgate.io als Worker-Secret (SIPGATE_TOKEN_ID und SIPGATE_TOKEN).
        </p>
      )}
      {mine?.configured && (
        <div className="flex flex-col gap-2">
          {mine.error && <p className="text-sm text-red-600">{mine.error}</p>}
          {mine.sipgateUser && (
            <>
              <p className="text-sm text-gray-700">
                sipgate-Nutzer: <span className="font-medium">{mine.sipgateUser.name}</span>
              </p>
              <label className="flex flex-col gap-1 sm:max-w-sm">
                <span className="text-xs font-medium text-gray-500">Mit diesem Telefon anrufen</span>
                <select
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  className="h-9 rounded-md border bg-white px-2 text-sm"
                  style={{ borderColor: "#dde3ea" }}
                >
                  <option value="">Bitte wählen</option>
                  {mine.devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.alias} · {DEVICE_TYPES[d.type] ?? d.type}
                      {d.online ? " · online" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={saveDevice}
                disabled={pending || !device}
                className="w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1e56a0" }}
              >
                Telefon speichern
              </button>
            </>
          )}
        </div>
      )}

      {isAdmin && admin?.configured && (
        <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "#eef2f6" }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Für Admins</span>
          {admin.error ? (
            <p className="text-sm text-red-600">{admin.error}</p>
          ) : admin.webhookActive ? (
            <p className="text-sm" style={{ color: "#1a9a6a" }}>
              ✓ Anruf-Benachrichtigung ist eingerichtet.
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-700">Damit Anrufe im Verlauf landen, muss sipgate Kandidatenwerk über jeden Anruf informieren.</p>
              {admin.otherUrls.length > 0 && (
                <p className="text-xs text-amber-700">
                  In sipgate sind bereits andere Webhook-Adressen eingetragen ({admin.otherUrls.join(", ")}). Beim Einrichten werden sie ersetzt.
                </p>
              )}
              <button
                type="button"
                onClick={() => setupWebhook(confirmReplace || admin.otherUrls.length > 0)}
                disabled={pending}
                className="w-fit rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1e56a0" }}
              >
                {admin.otherUrls.length > 0 ? "Ersetzen und einrichten" : "Anruf-Benachrichtigung einrichten"}
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p className="text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>
          {message.text}
        </p>
      )}
    </div>
  )
}
