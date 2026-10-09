"use client"

import { TEAM_OPTIONS, teamLabel } from "@/lib/teams"
import { useState, useTransition } from "react"
import { MetaCampaignsTab } from "./meta-campaigns-tab"
import { setCustomFieldSectionAction, type FieldTemplate, type LeadFormOverview } from "./field-actions"
import { FieldTemplatesTab } from "./field-templates-tab"
import { LeadFormsTab } from "./lead-forms-tab"
import { AutomationTemplatesTab } from "./automation-templates-tab"
import type { AutomationTemplate, AutomationTemplateSet } from "./automation-template-actions"
import type { LeadCampaignOverview } from "@/lib/meta-campaigns-queries"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ChevronDown, Clock, RefreshCw as SyncIcon, Send, Plus, Pencil } from "lucide-react"
import {
  updateOwnNameAction,
  updateOwnPasswordAction,
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateTeamMemberAction,
  updateAgencyNameAction,
  updateLeadNotificationRecipientsAction,
  createCustomFieldDefinitionAction,
  updateCustomFieldDefinitionLabelAction,
  setCustomFieldDefinitionActiveAction,
  dismissCustomFieldReviewQueueEntryAction,
  markCustomFieldReviewQueueEntryDoneAction,
  type TeamMember,
  type CustomFieldDefinition,
  type CustomFieldReviewQueueEntry,
} from "./actions"
import { ProfileFieldsEditor, SnippetsEditor } from "./profile-fields-tab"
import { BerufsbilderEditor } from "./berufsbilder-tab"
import type { ProfileFieldConfig } from "@/lib/profile-field-config"
import { AgencyLogoCard, ConfirmationSettings } from "./agency-settings-ui"
import type { AgencySettings } from "./agency-settings-actions"

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
  automationTemplates: { templates: AutomationTemplate[]; sets: AutomationTemplateSet[] }
  profileFieldConfig: ProfileFieldConfig
  agencySettings: AgencySettings
  leadNotificationRecipientIds: string[]
  customFieldDefinitions: CustomFieldDefinition[]
  customFieldReviewQueue: CustomFieldReviewQueueEntry[]
  metaCampaigns: LeadCampaignOverview[]
  fieldTemplates: FieldTemplate[]
  leadForms: LeadFormOverview[]
  leadSyncWarnings: { campaignId: string; campaignTitle: string; message: string }[]
}

// Reiter zusammengelegt (Paket 16, T-77): Agentur -> Mein Konto, Automatisierung +
// Vorlagen, Felder + Feld-Vorlagen, Meta-Kampagnen + Lead-Formulare = Lead-Anbindung.
// Innerhalb eines Reiters sind die Bereiche aufklappbar.
type Tab = "konto" | "team" | "automatisierung" | "felder" | "leadanbindung"

export function EinstellungenDetail({ ownProfile, agencyName, team, agencyId, automationTemplates, profileFieldConfig, agencySettings, leadNotificationRecipientIds, customFieldDefinitions, customFieldReviewQueue, metaCampaigns, fieldTemplates, leadForms, leadSyncWarnings }: EinstellungenDetailProps) {
  const [tab, setTab] = useState<Tab>("konto")
  const isAdmin = ownProfile.role === "agency_admin"
  const activeFields = customFieldDefinitions.filter((f) => f.active)
  const linkedForms = leadForms.filter((f) => f.campaigns.length > 0).length
  const activeMetaCampaigns = metaCampaigns.filter((c) => c.status === "active").length

  return (
    <div className="flex min-w-0 flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Einstellungen</h1>
      </div>

      <div>
        <div className="flex gap-0 overflow-x-auto border-b" style={{ borderColor: "#dde3ea" }}>
          <TabButton active={tab === "konto"} onClick={() => setTab("konto")}>Mein Konto</TabButton>
          <TabButton active={tab === "team"} onClick={() => setTab("team")}>Team ({team.length})</TabButton>
          <TabButton active={tab === "automatisierung"} onClick={() => setTab("automatisierung")}>E-Mail-Vorlagen</TabButton>
          <TabButton active={tab === "felder"} onClick={() => setTab("felder")}>Felder ({activeFields.length})</TabButton>
          <TabButton active={tab === "leadanbindung"} onClick={() => setTab("leadanbindung")}>Lead-Anbindung</TabButton>
        </div>

        <div className={tab === "konto" || tab === "team" ? "mt-4 max-w-lg" : "mt-4 max-w-4xl"}>
          {tab === "konto" && (
            <div className="flex flex-col gap-4">
              <KontoTab ownProfile={ownProfile} />
              <AgenturTab agencyName={agencyName} />
              <AgencyLogoCard logoUrl={agencySettings.logoUrl} isAdmin={isAdmin} />
            </div>
          )}
          {tab === "team" && <TeamTab team={team} ownProfileId={ownProfile.id} />}
          {tab === "automatisierung" && agencyId && (
            <div className="flex flex-col gap-3">
              <Section title="E-Mail-Vorlagen und Vorlagensets" meta={`${automationTemplates.templates.length} Vorlagen, ${automationTemplates.sets.length} Sets`} defaultOpen>
                <AutomationTemplatesTab templates={automationTemplates.templates} sets={automationTemplates.sets} />
              </Section>
              <Section
                title="Eingangsbestätigung an Kandidaten"
                meta={agencySettings.confirmationActive ? "eingeschaltet" : "aus"}
                defaultOpen={!agencySettings.confirmationActive}
              >
                <ConfirmationSettings settings={agencySettings} templates={automationTemplates.templates} isAdmin={isAdmin} />
              </Section>
              <Section title="Benachrichtigung bei neuen Leads (intern ans Team)" meta={`${leadNotificationRecipientIds.length} Empfänger`}>
                <div className="max-w-lg">
                  <AutomatisierungTab agencyId={agencyId} team={team} initialRecipientIds={leadNotificationRecipientIds} />
                </div>
              </Section>
            </div>
          )}
          {tab === "felder" && agencyId && (
            <div className="flex flex-col gap-3">
              <Section title="Kandidatenfelder" meta={`${activeFields.length} aktiv`} defaultOpen>
                <div className="max-w-lg">
                  <ZusatzfelderTab agencyId={agencyId} isAgencyAdmin={isAdmin} fields={customFieldDefinitions} reviewQueue={customFieldReviewQueue} />
                </div>
              </Section>
              {/* Berufsbilder pflegbar (Paket 45). */}
              <Section title="Berufsbilder" meta="für Kandidaten, Kampagnen und Stellen">
                <BerufsbilderEditor isAdmin={isAdmin} />
              </Section>
              <Section title="Feld-Vorlagen" meta={`${fieldTemplates.length} Vorlagen`}>
                <FieldTemplatesTab templates={fieldTemplates} fields={activeFields.filter((f) => f.section !== "stammdaten")} isAdmin={isAdmin} />
              </Section>
              {/* Kanzleiprofil, Stellenprofil und Textbausteine (Paket 18, T-80). */}
              <Section title="Kanzleiprofil" meta="Felder beim Kunden">
                <ProfileFieldsEditor scope="kanzlei" settings={profileFieldConfig.settings} />
              </Section>
              <Section title="Stellenprofil" meta="Felder je gesuchter Stelle">
                <ProfileFieldsEditor scope="stelle" settings={profileFieldConfig.settings} />
              </Section>
              <Section title="Textbausteine für Stellen" meta={`${profileFieldConfig.snippets.length} Bausteine`}>
                <SnippetsEditor snippets={profileFieldConfig.snippets} />
              </Section>
            </div>
          )}
          {tab === "leadanbindung" && (
            <div className="flex flex-col gap-3">
              <Section title="Meta-Kampagnen" meta={`${activeMetaCampaigns} laufend${leadSyncWarnings.length > 0 ? ` · ${leadSyncWarnings.length} Hinweis(e)` : ""}`} defaultOpen={leadSyncWarnings.length > 0}>
                <MetaCampaignsTab campaigns={metaCampaigns} isAdmin={isAdmin} warnings={leadSyncWarnings} />
              </Section>
              <Section title="Lead-Formulare" meta={`${linkedForms} verknüpft`}>
                <LeadFormsTab forms={leadForms} fields={activeFields} isAdmin={isAdmin} />
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Aufklappbarer Bereich innerhalb eines Reiters (Paket 16, T-77).
function Section({ title, meta, defaultOpen = false, children }: { title: string; meta?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border bg-white" style={{ borderColor: "#dde3ea" }}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left" aria-expanded={open}>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="flex items-center gap-2 text-xs text-gray-500">
          {meta}
          <ChevronDown size={16} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </span>
      </button>
      {open && <div className="border-t p-4" style={{ borderColor: "#eef2f6", backgroundColor: "#f8fafc" }}>{children}</div>}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors"
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

function TeamAvatar({ member, size = 36 }: { member: Pick<TeamMember, "full_name" | "avatarUrl">; size?: number }) {
  if (member.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={member.avatarUrl} alt={member.full_name ?? ""} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  }
  const initials = (member.full_name ?? "?").split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
  return (
    <div className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ width: size, height: size, backgroundColor: "#9ca3af30", color: "#6b7280" }}>
      {initials}
    </div>
  )
}

// Team-Mitglieder: Name und E-Mail Pflicht, Telefon und Foto optional (Paket 24). Beim Key
// Account Manager erscheinen sie als Ansprechpartner im Kundenportal.
function TeamTab({ team, ownProfileId }: { team: TeamMember[]; ownProfileId: string }) {
  const router = useRouter()

  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [invitePhone, setInvitePhone] = useState("")
  const [inviteAvatar, setInviteAvatar] = useState<File | null>(null)
  const [inviteRole, setInviteRole] = useState<"agency_admin" | "agency_member">("agency_member")
  const [inviteTeam, setInviteTeam] = useState("")
  const [invitePending, startInviteTransition] = useTransition()
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteKey, setInviteKey] = useState(0)

  const [removePending, startRemoveTransition] = useTransition()
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)

  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editPhone, setEditPhone] = useState("")
  const [editAvatar, setEditAvatar] = useState<File | null>(null)
  const [editRole, setEditRole] = useState<"agency_admin" | "agency_member">("agency_member")
  const [editTeam, setEditTeam] = useState("")
  const [editError, setEditError] = useState<string | null>(null)
  const [editPending, startEditTransition] = useTransition()

  function startEdit(m: TeamMember) {
    setEditId(m.id)
    setEditName(m.full_name ?? "")
    setEditPhone(m.phone ?? "")
    setEditAvatar(null)
    setEditRole(m.role)
    setEditTeam(m.team ?? "")
    setEditError(null)
    setRemoveConfirmId(null)
  }

  function handleSaveEdit() {
    if (!editId) return
    setEditError(null)
    const fd = new FormData()
    fd.set("full_name", editName)
    fd.set("phone", editPhone)
    fd.set("role", editRole)
    fd.set("team", editTeam)
    if (editAvatar) fd.set("avatar", editAvatar)
    startEditTransition(async () => {
      const result = await updateTeamMemberAction(editId, fd)
      if (result?.error) { setEditError(result.error); return }
      setEditId(null)
      router.refresh()
    })
  }

  function handleInvite() {
    setInviteError(null)
    const fd = new FormData()
    fd.set("email", inviteEmail)
    fd.set("full_name", inviteName)
    fd.set("phone", invitePhone)
    fd.set("role", inviteRole)
    fd.set("team", inviteTeam)
    if (inviteAvatar) fd.set("avatar", inviteAvatar)
    startInviteTransition(async () => {
      const result = await inviteTeamMemberAction(fd)
      if (result?.error) { setInviteError(result.error); return }
      setInviteEmail("")
      setInviteName("")
      setInvitePhone("")
      setInviteAvatar(null)
      setInviteKey((k) => k + 1)
      setInviteRole("agency_member")
      setInviteTeam("")
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

  const fileInputClass = "block w-full text-xs text-gray-600 file:mr-2 file:rounded-md file:border-0 file:px-2.5 file:py-1.5 file:text-xs file:font-medium"

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <h2 className="text-sm font-semibold text-gray-900">Team</h2>

        <div className="flex flex-col gap-2">
          {team.map((m) =>
            editId === m.id ? (
            <div key={m.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "#1e56a0" }}>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex min-w-[180px] flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Name *</label>
                  <input autoFocus className={inputClass} style={inputStyle} value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="flex min-w-[160px] flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Telefon</label>
                  <input type="tel" className={inputClass} style={inputStyle} value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="0221 123456" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Rolle</label>
                  <select
                    className={inputClass}
                    style={{ ...inputStyle, width: "auto" }}
                    value={editRole}
                    disabled={m.id === ownProfileId}
                    onChange={(e) => setEditRole(e.target.value as "agency_admin" | "agency_member")}
                  >
                    <option value="agency_member">Mitarbeiter</option>
                    <option value="agency_admin">Admin</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">Team</label>
                  <select
                    className={inputClass}
                    style={{ ...inputStyle, width: "auto" }}
                    value={editTeam}
                    onChange={(e) => setEditTeam(e.target.value)}
                  >
                    <option value="">Kein Team</option>
                    {TEAM_OPTIONS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TeamAvatar member={m} size={40} />
                <div className="flex min-w-[200px] flex-1 flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">{m.avatarUrl ? "Foto ersetzen" : "Foto"}</label>
                  <input type="file" accept="image/jpeg,image/png,image/webp" className={fileInputClass} onChange={(e) => setEditAvatar(e.target.files?.[0] ?? null)} />
                </div>
                <button onClick={handleSaveEdit} disabled={editPending} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
                  {editPending ? "…" : "Speichern"}
                </button>
                <button onClick={() => setEditId(null)} className="text-xs text-gray-500 hover:underline">Abbrechen</button>
              </div>
              <p className="text-xs text-gray-400">{m.email ?? "—"} · Die E-Mail-Adresse ist der Login und lässt sich hier nicht ändern.</p>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
            </div>
            ) : (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
              <div className="flex min-w-0 items-center gap-3">
                <TeamAvatar member={m} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.full_name ?? "—"}</p>
                  <p className="text-xs text-gray-500">
                    {[m.email, m.phone].filter(Boolean).join(" · ") || "—"}
                  </p>

                </div>
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
                {m.team && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#4ba3c318", color: "#0e7490" }}>
                    {teamLabel(m.team)}
                  </span>
                )}
                <button onClick={() => startEdit(m)} className="text-xs text-gray-500 hover:text-gray-800 hover:underline">
                  Bearbeiten
                </button>
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
            )
          )}
        </div>

        <div key={inviteKey} className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "#dde3ea" }}>
          <span className="text-xs font-semibold text-gray-700">Team-Mitglied einladen</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Name *</label>
              <input className={inputClass} style={inputStyle} value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Vorname Nachname" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">E-Mail *</label>
              <input type="email" placeholder="name@firma.de" className={inputClass} style={inputStyle} value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Telefon</label>
              <input type="tel" placeholder="0221 123456" className={inputClass} style={inputStyle} value={invitePhone} onChange={(e) => setInvitePhone(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Rolle</label>
              <select
                className={inputClass}
                style={inputStyle}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "agency_admin" | "agency_member")}
              >
                <option value="agency_member">Mitarbeiter</option>
                <option value="agency_admin">Admin</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Team</label>
              <select className={inputClass} style={inputStyle} value={inviteTeam} onChange={(e) => setInviteTeam(e.target.value)}>
                <option value="">Kein Team</option>
                {TEAM_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <label className="text-xs font-medium text-gray-600">Foto (optional, JPG, PNG oder WebP, max. 5 MB)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp" className={fileInputClass} onChange={(e) => setInviteAvatar(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <div>
            <button
              onClick={handleInvite}
              disabled={invitePending || !inviteEmail.trim() || !inviteName.trim()}
              className="rounded-md px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: "#1e56a0" }}
            >
              {invitePending ? "…" : "Einladen"}
            </button>
          </div>
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
  reviewQueue,
}: {
  agencyId: string
  isAgencyAdmin: boolean
  fields: CustomFieldDefinition[]
  reviewQueue: CustomFieldReviewQueueEntry[]
}) {
  const router = useRouter()
  const [newLabel, setNewLabel] = useState("")
  const [newSection, setNewSection] = useState<"stammdaten" | "zusatz">("zusatz")
  const [formError, setFormError] = useState<string | null>(null)
  const [createPending, startCreateTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")
  const [savePending, startSaveTransition] = useTransition()
  const [togglePendingId, setTogglePendingId] = useState<string | null>(null)
  const [, startToggleTransition] = useTransition()
  const [queuePendingId, setQueuePendingId] = useState<string | null>(null)
  const [, startQueueTransition] = useTransition()

  function handleDismissQueueEntry(id: string) {
    setQueuePendingId(id)
    startQueueTransition(async () => {
      await dismissCustomFieldReviewQueueEntryAction(id)
      setQueuePendingId(null)
      router.refresh()
    })
  }

  function handleMarkQueueEntryDone(id: string) {
    setQueuePendingId(id)
    startQueueTransition(async () => {
      await markCustomFieldReviewQueueEntryDoneAction(id)
      setQueuePendingId(null)
      router.refresh()
    })
  }

  const activeFields = fields.filter((f) => f.active).sort((a, b) => a.sort_order - b.sort_order)
  const inactiveFields = fields.filter((f) => !f.active).sort((a, b) => a.sort_order - b.sort_order)

  function handleCreate() {
    if (!newLabel.trim()) { setFormError("Bezeichnung ist ein Pflichtfeld."); return }
    setFormError(null)
    startCreateTransition(async () => {
      const result = await createCustomFieldDefinitionAction(agencyId, newLabel, newSection)
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

  function handleToggleSection(field: CustomFieldDefinition) {
    setTogglePendingId(field.id)
    startToggleTransition(async () => {
      const result = await setCustomFieldSectionAction(field.id, field.section === "stammdaten" ? "zusatz" : "stammdaten")
      if (result?.error) setFormError(result.error)
      setTogglePendingId(null)
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
          <h2 className="text-sm font-semibold text-gray-900">Felder</h2>
          <p className="mt-1 text-xs text-gray-500">
            Eigene Felder für Kandidaten. „Stammdaten“-Felder stehen im Profil oben bei
            Name, E-Mail und PLZ und werden immer angezeigt. Welche Zusatzfelder zu sehen
            sind, bestimmt die Feld-Vorlage der Kanzlei-Kampagne. Befüllt werden sie über
            die Zuordnung unter „Lead-Formulare“.
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
                    <p className="text-sm font-medium text-gray-900">
                      {field.label}
                      {field.section === "stammdaten" && (
                        <span className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: "#1e56a018", color: "#1e56a0" }}>
                          Stammdaten
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400">{field.key}</p>
                  </div>
                  {isAgencyAdmin && (
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleToggleSection(field)}
                        disabled={togglePendingId === field.id}
                        className="text-xs font-medium hover:underline disabled:opacity-50"
                        style={{ color: "#1e56a0" }}
                      >
                        {field.section === "stammdaten" ? "Zu Zusatzfeldern" : "In Stammdaten"}
                      </button>
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
              placeholder="Neues Feld, z.B. Führerschein"
              className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
              style={{ borderColor: "#dde3ea" }}
            />
            <select
              value={newSection}
              onChange={(e) => setNewSection(e.target.value as "stammdaten" | "zusatz")}
              className="rounded-md border px-2 py-1.5 text-xs"
              style={{ borderColor: "#dde3ea" }}
              aria-label="Bereich"
            >
              <option value="zusatz">Zusatzfeld</option>
              <option value="stammdaten">Stammdaten</option>
            </select>
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

      {reviewQueue.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-gray-900">
            {reviewQueue.length} unbekannte{reviewQueue.length !== 1 ? "" : "s"} Feld{reviewQueue.length !== 1 ? "er" : ""} aus Leadtable/Meta gefunden
          </h2>
          <p className="text-xs text-gray-500">
            Antworten aus Formularfragen, die keinem bestehenden Zusatzfeld zugeordnet
            werden konnten - wurden NICHT automatisch als Feld angelegt. Bei Bedarf oben
            ein passendes Feld anlegen, dann hier als erledigt markieren, oder verwerfen,
            wenn es nicht relevant ist.
          </p>
          <div className="flex flex-col gap-2">
            {reviewQueue.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5" style={{ borderColor: "#dde3ea" }}>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{entry.example_value || "(kein Beispielwert)"}</p>
                  <p className="text-xs text-gray-400">
                    {entry.raw_key} · {entry.occurrences}× gesehen
                  </p>
                </div>
                {isAgencyAdmin && (
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => handleMarkQueueEntryDone(entry.id)}
                      disabled={queuePendingId === entry.id}
                      className="text-xs font-medium hover:underline disabled:opacity-50"
                      style={{ color: "#1e56a0" }}
                    >
                      {queuePendingId === entry.id ? "…" : "Erledigt"}
                    </button>
                    <button
                      onClick={() => handleDismissQueueEntry(entry.id)}
                      disabled={queuePendingId === entry.id}
                      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                    >
                      {queuePendingId === entry.id ? "…" : "Verwerfen"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
