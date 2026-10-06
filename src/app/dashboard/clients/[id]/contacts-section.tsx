"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Pencil, Trash2 } from "lucide-react"
import { createContactAction, updateContactAction, deleteContactAction, inviteContactAction } from "./actions"
import type { PortalUser } from "./portal-access-section"

export interface Contact {
  id: string
  name: string
  email: string | null
  phone: string | null
  role: string | null
}

interface ContactForm {
  name: string
  email: string
  phone: string
  role: string
}

const EMPTY_FORM: ContactForm = { name: "", email: "", phone: "", role: "" }

const inputClass =
  "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

function ContactFormFields({
  form,
  onChange,
}: {
  form: ContactForm
  onChange: (f: ContactForm) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        className={inputClass}
        style={inputStyle}
        placeholder="Name *"
        value={form.name}
        onChange={(e) => onChange({ ...form, name: e.target.value })}
      />
      <input
        className={inputClass}
        style={inputStyle}
        placeholder="E-Mail *"
        type="email"
        value={form.email}
        onChange={(e) => onChange({ ...form, email: e.target.value })}
      />
      <input
        className={inputClass}
        style={inputStyle}
        placeholder="Telefon"
        type="tel"
        value={form.phone}
        onChange={(e) => onChange({ ...form, phone: e.target.value })}
      />
      <input
        className={inputClass}
        style={inputStyle}
        placeholder="Rolle"
        value={form.role}
        onChange={(e) => onChange({ ...form, role: e.target.value })}
      />
    </div>
  )
}

export function ContactsSection({
  clientId,
  contacts,
  portalUsers,
}: {
  clientId: string
  contacts: Contact[]
  portalUsers: PortalUser[]
}) {
  const router = useRouter()

  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState<ContactForm>(EMPTY_FORM)
  const [addError, setAddError] = useState<string | null>(null)
  const [addPending, startAddTransition] = useTransition()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ContactForm>(EMPTY_FORM)
  const [editError, setEditError] = useState<string | null>(null)
  const [editPending, startEditTransition] = useTransition()

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deletePending, startDeleteTransition] = useTransition()

  function openAdd() {
    setAddForm(EMPTY_FORM)
    setAddError(null)
    setShowAddForm(true)
  }

  function cancelAdd() {
    setShowAddForm(false)
    setAddError(null)
  }

  function handleAdd() {
    startAddTransition(async () => {
      const result = await createContactAction(clientId, addForm)
      if (result?.error) { setAddError(result.error); return }
      setAddForm(EMPTY_FORM)
      setShowAddForm(false)
      router.refresh()
    })
  }

  function openEdit(contact: Contact) {
    setEditingId(contact.id)
    setEditForm({
      name: contact.name,
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      role: contact.role ?? "",
    })
    setEditError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditError(null)
  }

  function handleUpdate() {
    if (!editingId) return
    startEditTransition(async () => {
      const result = await updateContactAction(editingId, clientId, editForm)
      if (result?.error) { setEditError(result.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  function handleDelete(contactId: string) {
    startDeleteTransition(async () => {
      const result = await deleteContactAction(contactId, clientId)
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
          Ansprechpartner ({contacts.length})
        </span>
        {!showAddForm && (
          <button
            onClick={openAdd}
            className="text-xs font-medium hover:underline"
            style={{ color: "#1e56a0" }}
          >
            + Hinzufügen
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <div
          className="rounded-lg border p-3 flex flex-col gap-2"
          style={{ borderColor: "#dde3ea", backgroundColor: "#f8fafc" }}
        >
          <ContactFormFields form={addForm} onChange={setAddForm} />
          {addError && <p className="text-xs text-red-600">{addError}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={addPending}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              {addPending ? "Wird gespeichert…" : "Hinzufügen"}
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

      {/* Empty state */}
      {contacts.length === 0 && !showAddForm && (
        <p className="text-sm text-gray-400">Noch keine Ansprechpartner hinterlegt.</p>
      )}

      {/* Contact rows */}
      {contacts.map((contact) => (
        <div
          key={contact.id}
          className="rounded-lg border"
          style={{ borderColor: "#dde3ea" }}
        >
          {editingId === contact.id ? (
            <div
              className="p-3 flex flex-col gap-2"
              style={{ backgroundColor: "#f8fafc" }}
            >
              <ContactFormFields form={editForm} onChange={setEditForm} />
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleUpdate}
                  disabled={editPending}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: "#1e56a0" }}
                >
                  {editPending ? "Wird gespeichert…" : "Speichern"}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={editPending}
                  className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  style={{ borderColor: "#dde3ea" }}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                {contact.email && <p className="text-xs text-gray-500 truncate">{contact.email}</p>}
                {(contact.role || contact.phone) && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {[contact.role, contact.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
                {contact.email && (
                  <ContactPortalStatus
                    clientId={clientId}
                    contactId={contact.id}
                    user={portalUsers.find((u) => (u.email ?? "").toLowerCase() === contact.email!.trim().toLowerCase()) ?? null}
                  />
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {deleteConfirmId === contact.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-gray-500">Löschen?</span>
                    <button
                      onClick={() => handleDelete(contact.id)}
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
                  <>
                    <button
                      onClick={() => openEdit(contact)}
                      className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      aria-label="Bearbeiten"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(contact.id)}
                      className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
                      aria-label="Löschen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// Ansprechpartner = Portal-Zugang (Paket 23, T-95): Status und Einladung per Knopf.
function ContactPortalStatus({ clientId, contactId, user }: { clientId: string; contactId: string; user: PortalUser | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const status = !user ? "Kein Portal-Zugang" : user.status === "aktiv" ? "Portal: aktiv" : user.status === "eingeladen" ? "Portal: eingeladen" : "Portal: angelegt, nicht eingeladen"
  const label = !user ? "Zugang anlegen & einladen" : user.status === "aktiv" ? "Passwort-Link senden" : "Einladung senden"

  function invite() {
    setMessage(null)
    startTransition(async () => {
      const result = await inviteContactAction(clientId, contactId)
      if ("error" in result) return setMessage({ ok: false, text: result.error })
      setMessage({ ok: true, text: `${result.sent === "einladung" ? "Einladung" : "Passwort-Link"} an ${result.email} geschickt.` })
      router.refresh()
    })
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
        style={user?.status === "aktiv" ? { backgroundColor: "#1a9a6a18", color: "#1a9a6a" } : { backgroundColor: "#9ca3af18", color: "#6b7280" }}
      >
        {status}
      </span>
      <button type="button" onClick={invite} disabled={pending} className="text-xs font-medium hover:underline disabled:opacity-50" style={{ color: "#1e56a0" }}>
        {pending ? "…" : label}
      </button>
      {message && <span className="text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>{message.text}</span>}
    </div>
  )
}
