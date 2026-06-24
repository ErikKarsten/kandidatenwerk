"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  updateClientAction,
  archiveClientAction,
  unarchiveClientAction,
  deleteClientPermanentlyAction,
  uploadClientLogoAction,
} from "./actions"
import { ContactsSection, type Contact } from "./contacts-section"

const CAMPAIGN_STATUS: Record<string, { label: string; bg: string; dot: string; text: string }> = {
  active: { label: "Aktiv", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  paused: { label: "Pausiert", bg: "#f5990018", dot: "#f59900", text: "#d97706" },
  completed: { label: "Abgeschlossen", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
}

interface Campaign {
  id: string
  title: string
  status: string
  created_at: string
  leads_count: number
}

interface Client {
  id: string
  name: string
  contact_email: string | null
  phone: string | null
  active: boolean
  status: string
  logo_url: string | null
}

interface ClientDetailProps {
  client: Client
  campaigns: Campaign[]
  contacts: Contact[]
}

type ModalStep = null | "choice" | "delete_confirm"

export function ClientDetail({ client, campaigns, contacts }: ClientDetailProps) {
  const router = useRouter()
  const [tab, setTab] = useState<"kampagnen" | "stammdaten">("kampagnen")
  const [editMode, setEditMode] = useState(false)
  const [displayLogoUrl, setDisplayLogoUrl] = useState(client.logo_url)

  // Modal state
  const [modalStep, setModalStep] = useState<ModalStep>(null)
  const [nameConfirm, setNameConfirm] = useState("")
  const [modalError, setModalError] = useState<string | null>(null)
  const [archivePending, startArchiveTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [unarchivePending, startUnarchiveTransition] = useTransition()

  function openModal() {
    setModalStep("choice")
    setNameConfirm("")
    setModalError(null)
  }

  function closeModal() {
    setModalStep(null)
    setNameConfirm("")
    setModalError(null)
  }

  function handleArchive() {
    startArchiveTransition(async () => {
      const result = await archiveClientAction(client.id)
      if (result?.error) { setModalError(result.error); return }
      window.location.href = "/dashboard/clients"
    })
  }

  function handleUnarchive() {
    startUnarchiveTransition(async () => {
      const result = await unarchiveClientAction(client.id)
      if (!result?.error) router.refresh()
    })
  }

  function handleDeletePermanently() {
    startDeleteTransition(async () => {
      const result = await deleteClientPermanentlyAction(client.id)
      if (result?.error) {
        setModalError(result.error)
        return
      }
      window.location.href = "/dashboard/clients"
    })
  }

  const nameMatches = nameConfirm.trim() === client.name

  return (
    <div className="flex flex-col gap-6 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>

      {/* ── Modal ── */}
      {modalStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border bg-white shadow-xl"
            style={{ borderColor: "#dde3ea" }}
          >
            {modalStep === "choice" && (
              <div className="p-6 flex flex-col gap-4">
                <h2 className="text-base font-semibold text-gray-900">
                  Wie möchten Sie fortfahren?
                </h2>

                {/* Archive option */}
                <div
                  className="rounded-lg border p-4 flex flex-col gap-3"
                  style={{ borderColor: "#dde3ea" }}
                >
                  <div>
                    <span
                      className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: "#1a9a6a18", color: "#1a9a6a" }}
                    >
                      Empfohlen
                    </span>
                    <p className="text-sm font-semibold text-gray-900">Archivieren</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Kunde wird aus der normalen Ansicht ausgeblendet. Kampagnen und Kandidaten
                      bleiben vollständig erhalten und können jederzeit wiederhergestellt werden.
                    </p>
                  </div>
                  <button
                    onClick={handleArchive}
                    disabled={archivePending}
                    className="self-start rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    style={{ borderColor: "#dde3ea" }}
                  >
                    {archivePending ? "Wird archiviert…" : "Archivieren"}
                  </button>
                </div>

                {/* Delete option */}
                <div
                  className="rounded-lg border p-4 flex flex-col gap-3"
                  style={{ borderColor: "#fca5a5" }}
                >
                  <div>
                    <span
                      className="mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: "#dc262618", color: "#dc2626" }}
                    >
                      Destruktiv
                    </span>
                    <p className="text-sm font-semibold text-gray-900">Endgültig löschen</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Kunde, <strong>alle Kampagnen</strong> und{" "}
                      <strong>alle Kandidaten</strong> werden unwiderruflich gelöscht. Diese
                      Aktion kann nicht rückgängig gemacht werden.
                    </p>
                  </div>
                  <button
                    onClick={() => { setModalError(null); setModalStep("delete_confirm") }}
                    className="self-start rounded-md border px-4 py-2 text-sm font-medium hover:bg-red-50"
                    style={{ borderColor: "#fca5a5", color: "#dc2626" }}
                  >
                    Endgültig löschen →
                  </button>
                </div>

                {modalError && <p className="text-xs text-red-600">{modalError}</p>}

                <button
                  onClick={closeModal}
                  className="self-start text-sm text-gray-500 hover:text-gray-700"
                >
                  Abbrechen
                </button>
              </div>
            )}

            {modalStep === "delete_confirm" && (
              <div className="p-6 flex flex-col gap-4">
                <div
                  className="flex items-start gap-3 rounded-lg p-3"
                  style={{ backgroundColor: "#dc262608", border: "1px solid #fca5a5" }}
                >
                  <span className="text-red-500 text-lg leading-none">⚠</span>
                  <p className="text-sm text-gray-700">
                    <strong>Diese Aktion ist unwiderruflich.</strong> Kunde, alle Kampagnen und
                    alle Kandidaten werden dauerhaft gelöscht.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-gray-600">
                    Geben Sie den Firmennamen zur Bestätigung ein:
                  </label>
                  <p className="text-xs text-gray-400 font-mono px-2 py-1 rounded bg-gray-50">
                    {client.name}
                  </p>
                  <input
                    autoFocus
                    value={nameConfirm}
                    onChange={(e) => setNameConfirm(e.target.value)}
                    placeholder={client.name}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
                    style={{ borderColor: nameConfirm && !nameMatches ? "#fca5a5" : "#dde3ea" }}
                  />
                  {nameConfirm && !nameMatches && (
                    <p className="text-xs text-red-500">Name stimmt nicht überein.</p>
                  )}
                </div>

                {modalError && <p className="text-xs text-red-600">{modalError}</p>}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDeletePermanently}
                    disabled={!nameMatches || deletePending}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: "#dc2626" }}
                  >
                    {deletePending ? "Wird gelöscht…" : "Endgültig löschen"}
                  </button>
                  <button
                    onClick={() => { setModalStep("choice"); setNameConfirm(""); setModalError(null) }}
                    disabled={deletePending}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    ← Zurück
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <Link
          href="/dashboard/clients"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          ← Zurück zur Übersicht
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {displayLogoUrl && (
            <img
              src={displayLogoUrl}
              alt={client.name}
              className="h-10 w-10 rounded-lg object-contain border"
              style={{ borderColor: "#dde3ea", backgroundColor: "#fff" }}
            />
          )}
          <h1 className="text-2xl font-bold text-gray-900">{client.name}</h1>

          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: client.active ? "#1a9a6a18" : "#9ca3af18",
              color: client.active ? "#1a9a6a" : "#6b7280",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: client.active ? "#1a9a6a" : "#9ca3af" }}
            />
            {client.active ? "Aktiv" : "Inaktiv"}
          </span>

          {client.status === "Archiviert" && (
            <>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: "#f59e0b18", color: "#b45309" }}
              >
                Archiviert
              </span>
              <button
                onClick={handleUnarchive}
                disabled={unarchivePending}
                className="text-xs font-medium underline text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {unarchivePending ? "…" : "Archivierung aufheben"}
              </button>
            </>
          )}

          <button
            onClick={openModal}
            className="ml-auto rounded-md border px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            style={{ borderColor: "#dde3ea" }}
          >
            Löschen / Archivieren
          </button>
          <button
            onClick={() => { setTab("stammdaten"); setEditMode(true) }}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
            style={{ backgroundColor: "#1e56a0" }}
          >
            Bearbeiten
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div>
        <div className="flex gap-0 border-b" style={{ borderColor: "#dde3ea" }}>
          <TabButton active={tab === "kampagnen"} onClick={() => setTab("kampagnen")}>
            Kampagnen ({campaigns.length})
          </TabButton>
          <TabButton active={tab === "stammdaten"} onClick={() => setTab("stammdaten")}>
            Stammdaten
          </TabButton>
        </div>

        <div className="mt-4">
          {tab === "kampagnen" && (
            <KampagnenTab clientId={client.id} campaigns={campaigns} />
          )}
          {tab === "stammdaten" && (
            <StammdatenTab
              client={client}
              editMode={editMode}
              setEditMode={setEditMode}
              contacts={contacts}
              onLogoUploaded={(url) => setDisplayLogoUrl(url)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2.5 text-sm font-medium transition-colors"
      style={{
        color: active ? "#1e56a0" : "#6b7280",
        borderBottom: active ? "2px solid #1e56a0" : "2px solid transparent",
        marginBottom: "-1px",
      }}
    >
      {children}
    </button>
  )
}

function KampagnenTab({ clientId, campaigns }: { clientId: string; campaigns: Campaign[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {campaigns.length} Kampagne{campaigns.length !== 1 ? "n" : ""}
        </p>
        <Link
          href={`/dashboard/campaigns/new?client_id=${clientId}`}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-white"
          style={{ backgroundColor: "#1e56a0" }}
        >
          + Neue Kampagne
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="rounded-xl border bg-white py-12 text-center text-sm text-gray-400" style={{ borderColor: "#dde3ea" }}>
          Noch keine Kampagnen.{" "}
          <Link href={`/dashboard/campaigns/new?client_id=${clientId}`} className="hover:underline" style={{ color: "#1e56a0" }}>
            Erste Kampagne anlegen
          </Link>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {campaigns.map((c) => {
            const s = CAMPAIGN_STATUS[c.status] ?? CAMPAIGN_STATUS.completed
            return (
              <Link
                key={c.id}
                href={`/dashboard/campaigns/${c.id}`}
                className="flex flex-col gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                style={{ borderColor: "#dde3ea" }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium leading-snug text-gray-900">{c.title}</h3>
                  <span
                    className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: s.bg, color: s.text }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.dot }} />
                    {s.label}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="font-medium" style={{ color: "#1e56a0" }}>
                    {c.leads_count} Lead{c.leads_count !== 1 ? "s" : ""}
                  </span>
                  <span>
                    {new Date(c.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StammdatenTab({
  client,
  editMode,
  setEditMode,
  contacts,
  onLogoUploaded,
}: {
  client: Client
  editMode: boolean
  setEditMode: (v: boolean) => void
  contacts: Contact[]
  onLogoUploaded: (url: string) => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [localName, setLocalName] = useState(client.name)
  const [localEmail, setLocalEmail] = useState(client.contact_email ?? "")
  const [localPhone, setLocalPhone] = useState(client.phone ?? "")
  const [localActive, setLocalActive] = useState(client.active)

  const [localLogoUrl, setLocalLogoUrl] = useState(client.logo_url)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoError(null)
    setLogoUploading(true)
    const fd = new FormData()
    fd.append("logo", file)
    const result = await uploadClientLogoAction(client.id, fd)
    setLogoUploading(false)
    if ("error" in result) {
      setLogoError(result.error)
    } else {
      setLocalLogoUrl(result.url)
      onLogoUploaded(result.url)
    }
  }

  function handleCancel() {
    setLocalName(client.name)
    setLocalEmail(client.contact_email ?? "")
    setLocalPhone(client.phone ?? "")
    setLocalActive(client.active)
    setError(null)
    setEditMode(false)
  }

  function handleSave() {
    setError(null)
    const fd = new FormData()
    fd.append("name", localName)
    fd.append("contact_email", localEmail)
    fd.append("phone", localPhone)
    fd.append("active", String(localActive))
    startTransition(async () => {
      const result = await updateClientAction(client.id, fd)
      if (result?.error) { setError(result.error); return }
      router.refresh()
      setEditMode(false)
    })
  }

  const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
  const inputStyle = { borderColor: "#dde3ea" }

  return (
    <div className="flex flex-col gap-4 max-w-lg">
      <div className="rounded-xl border bg-white p-6 flex flex-col gap-4" style={{ borderColor: "#dde3ea" }}>
        <FieldRow label="Logo" editMode={editMode}>
          {editMode ? (
            <div className="flex flex-col gap-2">
              {localLogoUrl && (
                <img src={localLogoUrl} alt="Logo" className="h-14 w-auto max-w-[140px] rounded-lg object-contain border" style={{ borderColor: "#dde3ea" }} />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                disabled={logoUploading}
                className="text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1 file:text-sm file:font-medium file:cursor-pointer"
              />
              {logoUploading && <span className="text-xs text-gray-400">Wird hochgeladen…</span>}
              {logoError && <span className="text-xs text-red-600">{logoError}</span>}
            </div>
          ) : (
            localLogoUrl
              ? <img src={localLogoUrl} alt="Logo" className="h-14 w-auto max-w-[140px] rounded-lg object-contain border" style={{ borderColor: "#dde3ea" }} />
              : "—"
          )}
        </FieldRow>

        <FieldRow label="Firmenname" editMode={editMode}>
          {editMode
            ? <input className={inputClass} style={inputStyle} value={localName} onChange={(e) => setLocalName(e.target.value)} />
            : (client.name || "—")}
        </FieldRow>

        <FieldRow label="E-Mail" editMode={editMode}>
          {editMode
            ? <input className={inputClass} style={inputStyle} type="email" value={localEmail} onChange={(e) => setLocalEmail(e.target.value)} />
            : (client.contact_email || "—")}
        </FieldRow>

        <FieldRow label="Telefon" editMode={editMode}>
          {editMode
            ? <input className={inputClass} style={inputStyle} type="tel" value={localPhone} onChange={(e) => setLocalPhone(e.target.value)} />
            : (client.phone || "—")}
        </FieldRow>

        {editMode && (
          <FieldRow label="Status" editMode={editMode}>
            <select
              className={inputClass}
              style={inputStyle}
              value={localActive ? "active" : "inactive"}
              onChange={(e) => setLocalActive(e.target.value === "active")}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </select>
          </FieldRow>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {editMode ? (
          <div className="flex items-center gap-3 pt-2">
            <button onClick={handleSave} disabled={pending} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
              {pending ? "Wird gespeichert…" : "Änderungen speichern"}
            </button>
            <button onClick={handleCancel} disabled={pending} className="rounded-md border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: "#dde3ea" }}>
              Abbrechen
            </button>
          </div>
        ) : (
          <div className="pt-2">
            <button onClick={() => setEditMode(true)} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
              Bearbeiten
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border bg-white p-6" style={{ borderColor: "#dde3ea" }}>
        <ContactsSection clientId={client.id} contacts={contacts} />
      </div>
    </div>
  )
}

function FieldRow({ label, editMode, children }: { label: string; editMode: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex ${editMode ? "flex-col gap-1" : "items-start gap-2"}`}>
      <div className="shrink-0 text-sm text-gray-500" style={{ minWidth: editMode ? undefined : "9rem" }}>
        {label}
      </div>
      <div className={`text-sm text-gray-900 ${editMode ? "w-full" : ""}`}>{children}</div>
    </div>
  )
}
