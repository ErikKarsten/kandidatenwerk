"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Clock, RefreshCw as SyncIcon, Send } from "lucide-react"
import {
  updateOwnNameAction,
  updateOwnPasswordAction,
  inviteTeamMemberAction,
  removeTeamMemberAction,
  updateAgencyNameAction,
  type TeamMember,
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
}

type Tab = "konto" | "team" | "agentur" | "automatisierung"

export function EinstellungenDetail({ ownProfile, agencyName, team }: EinstellungenDetailProps) {
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
          <TabButton active={tab === "automatisierung"} onClick={() => setTab("automatisierung")}>Automatisierung</TabButton>
        </div>

        <div className="mt-4 max-w-lg">
          {tab === "konto" && <KontoTab ownProfile={ownProfile} />}
          {tab === "team" && <TeamTab team={team} ownProfileId={ownProfile.id} />}
          {tab === "agentur" && <AgenturTab agencyName={agencyName} />}
          {tab === "automatisierung" && <AutomatisierungTab />}
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

function AutomatisierungTab() {
  return (
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
