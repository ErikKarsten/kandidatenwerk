"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
import { inviteClientPortalUserAction, portalPasswordResetAction, removeClientPortalUserAction } from "./actions"

export interface PortalUser {
  id: string
  email: string | null
  status: "eingeladen" | "aktiv"
}

const inputClass =
  "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

export function PortalAccessSection({
  clientId,
  portalUsers,
}: {
  clientId: string
  portalUsers: PortalUser[]
}) {
  const router = useRouter()

  const [showAddForm, setShowAddForm] = useState(false)
  const [email, setEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, startAddTransition] = useTransition()

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  function openAdd() {
    setEmail("")
    setAddError(null)
    setShowAddForm(true)
  }

  function cancelAdd() {
    setShowAddForm(false)
    setAddError(null)
  }

  function handleInvite() {
    startAddTransition(async () => {
      const result = await inviteClientPortalUserAction(clientId, email)
      if (result?.error) { setAddError(result.error); return }
      setEmail("")
      setShowAddForm(false)
      router.refresh()
    })
  }

  function handleRemove(profileId: string) {
    startDeleteTransition(async () => {
      const result = await removeClientPortalUserAction(profileId, clientId)
      if (!result?.error) {
        setDeleteConfirmId(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Portal-Zugänge ({portalUsers.length})
        </span>
        {!showAddForm && (
          <button
            onClick={openAdd}
            className="text-xs font-medium hover:underline"
            style={{ color: "#1e56a0" }}
          >
            + Einladen
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Eingeladene Adressen bekommen einen eigenen Login für das Kunden-Portal und
        sehen dort nur die diesem Kunden zugeordneten Kandidaten.
      </p>

      {showAddForm && (
        <div
          className="rounded-lg border p-3 flex flex-col gap-2"
          style={{ borderColor: "#dde3ea", backgroundColor: "#f8fafc" }}
        >
          <input
            className={inputClass}
            style={inputStyle}
            placeholder="E-Mail-Adresse *"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleInvite}
              disabled={addPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              {addPending ? "Wird eingeladen…" : "Einladen"}
            </button>
            <button
              onClick={cancelAdd}
              disabled={addPending}
              className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: "#dde3ea" }}
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {portalUsers.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-400">Noch keine Portal-Zugänge eingerichtet.</p>
      )}

      {portalUsers.map((user) => (
        <div
          key={user.id}
          className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
          style={{ borderColor: "#dde3ea" }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user.email}</p>
            <p className="text-xs mt-0.5" style={{ color: user.status === "aktiv" ? "#1a9a6a" : "#9ca3af" }}>
              {user.status === "aktiv" ? "Aktiv" : "Eingeladen, noch kein Login"}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <PasswordResetButtons clientId={clientId} profileId={user.id} />
            {deleteConfirmId === user.id ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Entfernen?</span>
                <button
                  onClick={() => handleRemove(user.id)}
                  disabled={deletePending}
                  className="rounded px-2 py-0.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#dc2626" }}
                >
                  Ja
                </button>
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  disabled={deletePending}
                  className="rounded border px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#dde3ea" }}
                >
                  Nein
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirmId(user.id)}
                className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
                aria-label="Entfernen"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// Passwort zurücksetzen (Paket 20, T-91): Link per Mail an den Zugang oder zum Kopieren.
function PasswordResetButtons({ clientId, profileId }: { clientId: string; profileId: string }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [link, setLink] = useState<string | null>(null)

  function run(mode: "senden" | "kopieren") {
    setMessage(null)
    setLink(null)
    startTransition(async () => {
      const result = await portalPasswordResetAction(clientId, profileId, mode)
      if ("error" in result) return setMessage({ ok: false, text: result.error })
      if (result.link) {
        setLink(result.link)
        try {
          await navigator.clipboard.writeText(result.link)
          setMessage({ ok: true, text: "Link kopiert – zeitlich begrenzt gültig." })
        } catch {
          setMessage({ ok: true, text: "Link erzeugt – bitte unten kopieren." })
        }
      } else {
        setMessage({ ok: true, text: `Link an ${result.sentTo} geschickt.` })
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => run("senden")} disabled={pending} className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: "#dde3ea" }}>
          {pending ? "…" : "Passwort-Link senden"}
        </button>
        <button type="button" onClick={() => run("kopieren")} disabled={pending} className="rounded border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: "#dde3ea" }}>
          Link kopieren
        </button>
      </div>
      {message && <span className="text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>{message.text}</span>}
      {link && <input readOnly value={link} onFocus={(e) => e.target.select()} className="w-64 rounded border px-2 py-0.5 text-[11px] text-gray-600" style={{ borderColor: "#dde3ea" }} />}
    </div>
  )
}
