"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Clock, RefreshCw as SyncIcon, Send, Plus, Pencil, Trash2 } from "lucide-react"
import {
  updateOwnNameAction,
  updateOwnPasswordAction,
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateAgencyNameAction,
  createEmailTemplateAction,
  updateEmailTemplateAction,
  deleteEmailTemplateAction,
  updateLeadNotificationRecipientsAction,
  createCustomFieldDefinitionAction,
  updateCustomFieldDefinitionLabelAction,
  setCustomFieldDefinitionActiveAction,
  type TeamMember,
  type EmailTemplate,
  type CustomFieldDefinition,
} from "./actions"

const MIN_PASSWORD_LENGTH = 8

interface OwnProfile {
  id: string
  full_name: string | null
  email: string | null
  role: "agency_admin" | "agency_member"
}

interface EinstellungenDetailProps {
  ownProfile: OwnProfile
  agencyName: string
  team: TeamMember[]
  agencyId: string | null
  emailTemplates: EmailTemplate[]
  leadNotificationRecipientIds: string[]
  customFieldDefinitions: CustomFieldDefinition[]
}

type Tab = "konto" | "team" | "agentur" | "automatisierung" | "vorlagen" | "zusatzfelder"

export function EinstellungenDetail({ ownProfile, agencyName, team, agencyId, emailTemplates, leadNotificationRecipientIds, customFieldDefinitions }: EinstellungenDetailProps) {
  const [tab, setTab] = useState<Tab>("konto")

  return (
    <div className="flex flex-col gap-6 p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
      </div>

      <div>
        <div className="flex gap-0 border-b" style={{ borderColor: "#dde3ea" }}>
          <TabButton active={tab === "konto"} onClick={() => setTab("konto")}>Mein Konto</TabButton>
          <TabButton active={tab === "team"} onClick={() => setTab("team")}>Team ({team.length})</TabButton>
          <TabButton active={tab === "agentur"} onClick={() => setTab("agentur")}>Agentur</TabButton>
          <TabButton active={tab === "vorlagen"} onClick={() => setTab("vorlagen")}>E-Mail-Vorlagen ({emailTemplates.length})</TabButton>
          <TabButton active={tab === "automatisierung"} onClick={() => setTab("automatisierung")}>Automatisierung</TabButton>
          <TabButton active={tab === "zusatzfelder"} onClick={() => setTab("zusatzfelder")}>Zusatzfelder ({customFieldDefinitions.filter((f) => f.active).length})</TabButton>
        </div>

        <div className="mt-4 max-w-lg">
          {tab === "konto" && <KontoTab ownProfile={ownProfile} />}
          {tab === "team" && <TeamTab team={team} ownProfileId={ownProfile.id} />}
          {tab === "agentur" && <AgenturTab agencyName={agencyName} />}
          {tab === "vorlagen" && agencyId && <EmailVorlagenTab agencyId={agencyId} templates={emailTemplates} />}
          {tab === "automatisierung" && agencyId && (
            <AutomatisierungTab agencyId={agencyId} team={team} initialRecipientIds={leadNotificationRecipientIds} />
          )}
          {tab === "zusatzfelder" && agencyId && (
            <ZusatzfelderTab agencyId={agencyId} isAgencyAdmin={ownProfile.role === "agency_admin"} fields={customFieldDefinitions} />
          )}
        </div>
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-6 flex flex-col gap-4" style={{ borderColor: "#dde3ea" }}>
      {children}
    </div>
  )
}

const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

function KontoTab({ ownProfile }: { ownProfile: OwnProfile }) {
  const router = useRouter()

  const [name, setName] = useState(ownProfile.full_name ?? "")
  const [namePending, startNameTransition] = useTransition()
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [password, setPassword] = useState("")
  const [passwordRepeat, setPasswordRepeat] = useState("")
  const [passwordPending, startPasswordTransition] = useTransition()
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSaved, setPasswordSaved] = useState(false)

  function handleSaveName() {
    setNameError(null)
    setNameSaved(false)
    startNameTransition(async () => {
      const result = await updateOwnNameAction(name)
      if (result?.error) { setNameError(result.error); return }
      setNameSaved(true)
      router.refresh()
    })
  }

  function handleChangePassword() {
    setPasswordError(null)
    setPasswordSaved(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`)
      return
    }
    if (password !== passwordRepeat) {
      setPasswordError("Die Passwörter stimmen nicht überein.")
      return
    }
    startPasswordTransition(async () => {
      const result = await updateOwnPasswordAction(password)
      if (result?.error) { setPasswordError(result.error); return }
      setPassword("")
      setPasswordRepeat("")
      setPasswordSaved(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Profil</h2>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">Name</label>
          <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">E-Mail</label>
          <p className="text-sm text-gray-900">{ownProfile.email ?? "—"}</p>
        </div>
        {nameError && <p className="text-xs text-red-600">{nameError}</p>}
        {nameSaved && !nameError && <p className="text-xs" style={{ color: "#1a9a6a" }}>Gespeichert.</p>}
        <button
          onClick={handleSaveName}
          disabled={namePending}
          className="self-start rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {namePending ? "Wird gespeichert…" : "Speichern"}
        </button>
      </Card>

      <Card>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Passwort ändern</h2>
          <p className="mt-1 text-xs text-gray-500">
            Bisher nur über den Umweg Supabase-Dashboard-Passwort-Reset möglich.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">Neues Passwort</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
            style={inputStyle}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-gray-600">Passwort wiederholen</label>
          <input
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className={inputClass}
            style={inputStyle}
            value={passwordRepeat}
            onChange={(e) => setPasswordRepeat(e.target.value)}
          />
        </div>
        {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
        {passwordSaved && !passwordError && <p className="text-xs" style={{ color: "#1a9a6a" }}>Passwort geändert.</p>}
        <button
          onClick={handleChangePassword}
          disabled={passwordPending}
          className="self-start rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {passwordPending ? "Wird geändert…" : "Passwort ändern"}
        </button>
      </Card>
    </div>
  )
}

function TeamTab({ team, ownProfileId }: { team: TeamMember[]; ownProfileId: string }) {
  const router = useRouter()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<"agency_admin" | "agency_member">("agency_member")
  const [invitePending, startInviteTransition] = useTransition()
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [removePending, startRemoveTransition] = useTransition()
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)

  function handleInvite() {
    setInviteError(null)
    startInviteTransition(async () => {
      const result = await inviteTeamMemberAction(inviteEmail, inviteRole)
      if (result?.error) { setInviteError(result.error); return }
      setInviteEmail("")
      setInviteRole("agency_member")
      router.refresh()
    })
  }

  function handleRemove(id: string) {
    startRemoveTransition(async () => {
      await removeTeamMemberAction(id)
      setRemoveConfirmId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Team</h2>

        <div className="flex flex-col gap-2">
          {team.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
              <div>
                <p className="text-sm font-medium text-gray-900">{m.full_name ?? "—"}</p>
                <p className="text-xs text-gray-500">{m.email ?? "—"}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                  style={
                    m.role === "agency_admin"
                      ? { backgroundColor: "#1e56a018", color: "#1e56a0" }
                      : { backgroundColor: "#9ca3af18", color: "#6b7280" }
                  }
                >
                  {m.role === "agency_admin" ? "Admin" : "Mitarbeiter"}
                </span>
                {m.id === ownProfileId ? (
                  <span className="text-xs text-gray-400">Du</span>
                ) : removeConfirmId === m.id ? (
                  <button
                    onClick={() => handleRemove(m.id)}
                    disabled={removePending}
                    className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                  >
                    {removePending ? "…" : "Wirklich entfernen?"}
                  </button>
                ) : (
                  <button
                    onClick={() => setRemoveConfirmId(m.id)}
                    className="text-xs text-gray-400 hover:text-red-600"
                  >
                    Entfernen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-end gap-2 pt-2 border-t" style={{ borderColor: "#dde3ea" }}>
          <div className="flex flex-col gap-1.5 flex-1">
            <label className="text-xs font-medium text-gray-600">E-Mail einladen</label>
            <input
              type="email"
              placeholder="name@firma.de"
              className={inputClass}
              style={inputStyle}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-600">Rolle</label>
            <select
              className={inputClass}
              style={{ ...inputStyle, width: "auto" }}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "agency_admin" | "agency_member")}
            >
              <option value="agency_member">Mitarbeiter</option>
              <option value="agency_admin">Admin</option>
            </select>
          </div>
          <button
            onClick={handleInvite}
            disabled={invitePending || !inviteEmail.trim()}
            className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            {invitePending ? "…" : "Einladen"}
          </button>
        </div>
        {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
      </Card>

      <p className="text-xs text-gray-400">
        Admins bekommen automatisch die tägliche Duplettenprüfungs-Mail — keine separate Empfängerliste zu pflegen.
      </p>
    </div>
  )
}

function AgenturTab({ agencyName }: { agencyName: string }) {
  const router = useRouter()
  const [name, setName] = useState(agencyName)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await updateAgencyNameAction(name)
      if (result?.error) { setError(result.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">Agentur-Profil</h2>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-gray-600">Agentur-Name</label>
        <input className={inputClass} style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && !error && <p className="text-xs" style={{ color: "#1a9a6a" }}>Gespeichert.</p>}
      <button
        onClick={handleSave}
        disabled={pending}
        className="self-start rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        style={{ backgroundColor: "#1e56a0" }}
      >
        {pending ? "Wird gespeichert…" : "Speichern"}
      </button>
    </Card>
  )
}

// Kein lokaler Mirror-State fuer die Liste (anders als frueher versucht) - templates
// kommt direkt aus der Props, die nach router.refresh() vom Server neu durchgereicht
// wird (gleiches Prinzip wie TeamTab oben, das `team` ebenfalls direkt aus Props
// rendert). Ein useState(initialTemplates) haette sich nach dem ersten Mount nie wieder
// mit neuen Props synchronisiert - frisch angelegte/geloeschte Vorlagen waeren in der
// Liste nicht sichtbar geworden, obwohl der Tab-Zaehler oben (aus derselben Props-Quelle)
// schon korrekt aktualisiert war.
function EmailVorlagenTab({ agencyId, templates }: { agencyId: string; templates: EmailTemplate[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<{ template: EmailTemplate | null; isNew: boolean } | null>(null)
  const [name, setName] = useState("")
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [savePending, startSaveTransition] = useTransition()
  const [deletePending, startDeleteTransition] = useTransition()
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)

  function openNew() {
    setName("")
    setSubject("")
    setBodyHtml("")
    setFormError(null)
    setModal({ template: null, isNew: true })
  }

  function openEdit(t: EmailTemplate) {
    setName(t.name)
    setSubject(t.subject)
    setBodyHtml(t.body_html)
    setFormError(null)
    setModal({ template: t, isNew: false })
  }

  function closeModal() {
    setModal(null)
    setFormError(null)
  }

  function handleSave() {
    if (!name.trim()) { setFormError("Name ist ein Pflichtfeld."); return }
    setFormError(null)

    startSaveTransition(async () => {
      const data = { name, subject, body_html: bodyHtml }
      if (modal?.isNew) {
        const result = await createEmailTemplateAction(agencyId, data)
        if (result?.error) { setFormError(result.error); return }
      } else if (modal?.template) {
        const result = await updateEmailTemplateAction(modal.template.id, data)
        if (result?.error) { setFormError(result.error); return }
      }
      router.refresh()
      closeModal()
    })
  }

  function handleDelete(id: string) {
    startDeleteTransition(async () => {
      const result = await deleteEmailTemplateAction(id)
      if (result?.error) { setFormError(result.error); return }
      setRemoveConfirmId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">E-Mail-Vorlagen</h2>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <Plus size={13} />
            Neue Vorlage
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="text-sm text-gray-400">Noch keine eigenen Vorlagen angelegt.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500 truncate">{t.subject || "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                    aria-label="Bearbeiten"
                  >
                    <Pencil size={14} />
                  </button>
                  {removeConfirmId === t.id ? (
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deletePending}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {deletePending ? "…" : "Wirklich löschen?"}
                    </button>
                  ) : (
                    <button
                      onClick={() => setRemoveConfirmId(t.id)}
                      className="rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-50"
                      aria-label="Löschen"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="flex w-full max-w-2xl flex-col rounded-xl border bg-white shadow-xl"
            style={{ borderColor: "#dde3ea", maxHeight: "90vh" }}
          >
            <div className="flex items-center justify-between gap-4 border-b px-6 py-4" style={{ borderColor: "#dde3ea" }}>
              <h2 className="text-base font-semibold text-gray-900">
                {modal.isNew ? "Neue E-Mail-Vorlage" : "Vorlage bearbeiten"}
              </h2>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Name *</label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="z. B. Eingangsbestätigung"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">
                  Betreff{" "}
                  <span className="font-normal text-gray-400">
                    — Variablen: #Kandidatenname, #Kampagnenname, #Kundenname, #Email, #Telefon
                  </span>
                </label>
                <input
                  className={inputClass}
                  style={inputStyle}
                  placeholder="Betreff der E-Mail"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600">Text</label>
                <textarea
                  className={inputClass}
                  style={{ ...inputStyle, resize: "vertical" }}
                  rows={8}
                  placeholder="Inhalt der E-Mail…"
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                />
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-6 py-4" style={{ borderColor: "#dde3ea" }}>
              <button
                onClick={closeModal}
                disabled={savePending}
                className="rounded-md border px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                style={{ borderColor: "#dde3ea" }}
              >
                Abbrechen
              </button>
              <button
                onClick={handleSave}
                disabled={savePending}
                className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: "#1e56a0" }}
              >
                {savePending ? "Wird gespeichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AutomatisierungTab({
  agencyId,
  team,
  initialRecipientIds,
}: {
  agencyId: string
  team: TeamMember[]
  initialRecipientIds: string[]
}) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>(initialRecipientIds)
  const [savePending, startSaveTransition] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function toggle(id: string) {
    setSaved(false)
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function handleSave() {
    setSaveError(null)
    setSaved(false)
    startSaveTransition(async () => {
      const result = await updateLeadNotificationRecipientsAction(agencyId, selectedIds)
      if (result?.error) { setSaveError(result.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Benachrichtigung bei neuem Lead</h2>
          <p className="mt-1 text-xs text-gray-500">
            Diese Team-Mitglieder bekommen eine Mail, sobald ein neuer Kandidat angelegt wird (manuell,
            Meta-Leads, Leadtable) — mit direktem Link zum Kandidaten.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {team.map((m) => (
            <label
              key={m.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 hover:bg-gray-50"
              style={{ borderColor: selectedIds.includes(m.id) ? "#1e56a0" : "#dde3ea" }}
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="shrink-0 accent-[#1e56a0]"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{m.full_name ?? "—"}</p>
                <p className="text-xs text-gray-500">{m.email ?? "—"}</p>
              </div>
            </label>
          ))}
          {team.length === 0 && <p className="text-sm text-gray-400">Kein Team vorhanden.</p>}
        </div>

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}
        {saved && !saveError && <p className="text-xs" style={{ color: "#1a9a6a" }}>Gespeichert.</p>}
        <button
          onClick={handleSave}
          disabled={savePending}
          className="self-start rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: "#1e56a0" }}
        >
          {savePending ? "Wird gespeichert…" : "Speichern"}
        </button>
      </Card>

      <Card>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Automatisierung</h2>
          <p className="mt-1 text-xs text-gray-500">
            Übersicht statt neuer Schalter — diese drei Dinge laufen bereits automatisch, nur an
            verschiedenen Stellen.
          </p>
        </div>

        <InfoRow icon={Clock} title="Duplettenprüfung">
          Läuft täglich 7:00 Uhr, Mail geht an alle Admins aus dem Team-Bereich oben.
        </InfoRow>
        <InfoRow icon={SyncIcon} title="Leadtable-Sync">
          Läuft täglich 6:00 Uhr automatisch, manueller Trigger existiert bereits auf dem{" "}
          <Link href="/dashboard" className="hover:underline" style={{ color: "#1e56a0" }}>Dashboard</Link>.
        </InfoRow>
        <InfoRow icon={Send} title="Kunden-Weiterleitung bei Vorqualifizierung">
          Pro Kunde einzeln steuerbar, auf der jeweiligen{" "}
          <Link href="/dashboard/clients" className="hover:underline" style={{ color: "#1e56a0" }}>Kundenseite</Link>.
        </InfoRow>
      </Card>
    </div>
  )
}

function InfoRow({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: "#1e56a018" }}
      >
        <Icon size={16} style={{ color: "#1e56a0" }} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{children}</p>
      </div>
    </div>
  )
}

// Zusatzfelder-Verwaltung (Schritt 2/3 des Umbaus vom 25.09.2026) - Hinzufügen/
// Umbenennen/(De-)Aktivieren nur für agency_admin (Punkt 4 der Anfrage), agency_member
// sieht die Liste nur lesend (die Felder betreffen ohnehin schon die eigene Agentur,
// kein zusätzliches Sicherheitsrisiko beim reinen Lesen).
function ZusatzfelderTab({
  agencyId,
  isAgencyAdmin,
  fields,
}: {
  agencyId: string
  isAgencyAdmin: boolean
  fields: CustomFieldDefinition[]
}) {
  const router = useRouter()
  const [newLabel, setNewLabel] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [createPending, startCreateTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [savePending, startSaveTransition] = useTransition()
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null)
  const [, startToggleTransition] = useTransition()

  const activeFields = fields.filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  const inactiveFields = fields.filter((f) => !f.active).sort((a, b) => a.sort_order - b.sort_order)

  function handleCreate() {
    if (!newLabel.trim()) { setFormError("Bezeichnung ist ein Pflichtfeld."); return }
    setFormError(null)
    startCreateTransition(async () => {
      const result = await createCustomFieldDefinitionAction(agencyId, newLabel)
      if (result?.error) { setFormError(result.error); return }
      setNewLabel("")
      router.refresh()
    })
  }

  function startEdit(field: CustomFieldDefinition) {
    setEditingId(field.id)
    setEditLabel(field.label)
    setFormError(null)
  }

  function handleSaveEdit() {
    if (!editingId) return
    if (!editLabel.trim()) { setFormError("Bezeichnung ist ein Pflichtfeld."); return }
    setFormError(null)
    startSaveTransition(async () => {
      const result = await updateCustomFieldDefinitionLabelAction(editingId, editLabel)
      if (result?.error) { setFormError(result.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  function handleToggleActive(field: CustomFieldDefinition) {
    setTogglePendingId(field.id)
    startToggleTransition(async () => {
      await setCustomFieldDefinitionActiveAction(field.id, !field.active)
      setTogglePendingId(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Zusatzfelder</h2>
          <p className="mt-1 text-xs text-gray-500">
            Diese Felder erscheinen auf jedem Kandidatenprofil (intern und im
            Kunden-Portal) und werden bei der Leadtable-/Meta-Übernahme automatisch
            befüllt, sofern erkennbar.
          </p>
        </div>

        {activeFields.length === 0 && <p className="text-sm text-gray-400">Noch keine Zusatzfelder angelegt.</p>}

        <div className="flex flex-col gap-2">
          {activeFields.map((field) => (
            <div key={field.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
              {editingId === field.id ? (
                <div className="flex flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    className="flex-1 rounded-md border px-2 py-1 text-sm focus:outline-none focus:ring-1"
                    style={{ borderColor: "#dde3ea" }}
                  />
                  <button
                    onClick={handleSaveEdit}
                    disabled={savePending}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "#1e56a0" }}
                  >
                    {savePending ? "…" : "Speichern"}
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={savePending}
                    className="text-xs text-gray-500 hover:text-gray-700"
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{field.label}</p>
                    <p className="text-xs text-gray-400">{field.key}</p>
                  </div>
                  {isAgencyAdmin && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => startEdit(field)}
                        className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                        aria-label="Bezeichnung ändern"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleActive(field)}
                        disabled={togglePendingId === field.id}
                        className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                      >
                        {togglePendingId === field.id ? "…" : "Deaktivieren"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {isAgencyAdmin && (
          <div className="flex items-center gap-2 border-t pt-4" style={{ borderColor: "#dde3ea" }}>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Neues Zusatzfeld, z.B. Führerschein"
              className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea" }}
            />
            <button
              onClick={handleCreate}
              disabled={createPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              <Plus size={13} />
              {createPending ? "…" : "Hinzufügen"}
            </button>
          </div>
        )}

        {formError && <p className="text-xs text-red-600">{formError}</p>}
      </Card>

      {inactiveFields.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-900">Deaktivierte Felder</h2>
          <p className="text-xs text-gray-500">
            Nicht mehr in Anzeige/Extraktion sichtbar - bereits gespeicherte Werte
            bleiben erhalten und erscheinen nach Reaktivierung wieder.
          </p>
          <div className="flex flex-col gap-2">
            {inactiveFields.map((field) => (
              <div key={field.id} className="flex items-center justify-between rounded-lg border px-3 py-2.5 opacity-60" style={{ borderColor: "#dde3ea" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{field.label}</p>
                  <p className="text-xs text-gray-400">{field.key}</p>
                </div>
                {isAgencyAdmin && (
                  <button
                    onClick={() => handleToggleActive(field)}
                    disabled={togglePendingId === field.id}
                    className="shrink-0 text-xs font-medium hover:underline disabled:opacity-50"
                    style={{ color: "#1e56a0" }}
                  >
                    {togglePendingId === field.id ? "…" : "Reaktivieren"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
