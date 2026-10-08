"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { resizeImageFile } from "@/lib/resize-image"
import { removeAgencyLogoAction, saveConfirmationSettingsAction, uploadAgencyLogoAction, type AgencySettings } from "./agency-settings-actions"

// Zentrale Eingangsbestätigung an Kandidaten (Paket 23, T-93).
export function ConfirmationSettings({
  settings,
  templates,
  isAdmin,
}: {
  settings: AgencySettings
  templates: { id: string; name: string; recipient: string }[]
  isAdmin: boolean
}) {
  const router = useRouter()
  const options = templates.filter((t) => t.recipient === "candidate")
  const [active, setActive] = useState(settings.confirmationActive)
  const [templateId, setTemplateId] = useState(settings.confirmationTemplateId ?? options.find((t) => t.name === "Eingangsbestätigung")?.id ?? "")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save(nextActive = active) {
    setMessage(null)
    startTransition(async () => {
      const result = await saveConfirmationSettingsAction({ active: nextActive, templateId: templateId || null })
      if (result?.error) return setMessage({ ok: false, text: result.error })
      setActive(nextActive)
      setMessage({ ok: true, text: nextActive ? "Eingeschaltet – gilt für alle Leads ab jetzt." : "Gespeichert." })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-500">
        Geht an jeden Kandidaten, der über ein Meta-Lead-Formular oder Kanzleistelle24 eingeht – unabhängig von der Kampagne, sofort beim Eingang und
        je Kandidat einmal. Von Hand angelegte Kandidaten bekommen sie nicht. Den Text bearbeitest du oben bei den E-Mail-Vorlagen.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-gray-800">
          <input type="checkbox" checked={active} disabled={!isAdmin || pending} onChange={(e) => save(e.target.checked)} />
          Eingangsbestätigung verschicken
        </label>
        <select
          className="rounded-md border bg-white px-2 py-1 text-sm"
          style={{ borderColor: "#dde3ea" }}
          value={templateId}
          disabled={!isAdmin || pending}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">Vorlage wählen…</option>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button type="button" onClick={() => save()} disabled={pending} className="rounded-md px-3 py-1 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
            {pending ? "…" : "Speichern"}
          </button>
        )}
      </div>
      {!isAdmin && <p className="text-xs text-gray-400">Ändern können nur Admins.</p>}
      {message && <p className="text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>{message.text}</p>}
    </div>
  )
}

// Logo für alle Mails (Paket 23, T-94).
export function AgencyLogoCard({ logoUrl, isAdmin }: { logoUrl: string | null; isAdmin: boolean }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function upload(file: File | undefined) {
    if (!file) return
    setError(null)
    startTransition(async () => {
      // Vor dem Hochladen auf Mail-Größe verkleinern (Paket 38).
      let resized: Awaited<ReturnType<typeof resizeImageFile>>
      try {
        resized = await resizeImageFile(file)
      } catch {
        return setError("Das Bild konnte nicht gelesen werden. Bitte PNG, JPG oder WebP verwenden.")
      }
      const fd = new FormData()
      fd.set("logo", resized.file)
      fd.set("width", String(resized.width))
      fd.set("height", String(resized.height))
      const result = await uploadAgencyLogoAction(fd)
      if ("error" in result) return setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Logo für E-Mails</h2>
        <p className="text-xs text-gray-500">Erscheint im Kopf aller Mails an Kandidaten, Kanzleien und das Team. PNG, JPG oder WebP, max. 2 MB.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 min-w-[120px] items-center justify-center rounded-lg border px-3" style={{ borderColor: "#dde3ea", backgroundColor: "#f0f4f8" }}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="max-h-12 max-w-[180px] object-contain" />
          ) : (
            <span className="text-xs text-gray-400">Kein Logo</span>
          )}
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-1.5">
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={pending} onChange={(e) => upload(e.target.files?.[0])} className="text-xs text-gray-600" />
            {logoUrl && (
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(async () => { const r = await removeAgencyLogoAction(); if (r?.error) setError(r.error); else router.refresh() })}
                className="w-fit text-xs text-gray-500 hover:text-red-600 hover:underline"
              >
                Logo entfernen
              </button>
            )}
          </div>
        )}
      </div>
      {pending && <p className="text-xs text-gray-400">Wird gespeichert…</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
