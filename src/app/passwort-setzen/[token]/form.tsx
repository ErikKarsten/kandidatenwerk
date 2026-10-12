"use client"

import { useState } from "react"
import Link from "next/link"
import { Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { LegalLinks } from "@/components/legal-links"
import { setPasswordFromLinkAction } from "./actions"

const MIN_PASSWORD_LENGTH = 8

type PageState = "ready" | "error" | "success"

// Formular zum eigenen Passwort-Link (Paket 55) - Aufbau wie /set-password.
export function SetPasswordFromLinkForm({ token, valid }: { token: string; valid: boolean }) {
  const [pageState, setPageState] = useState<PageState>(valid ? "ready" : "error")
  const [pageError, setPageError] = useState<string | null>(valid ? null : "Dieser Link ist ungültig oder wurde schon verwendet. Bitte beim Team einen neuen Link anfordern.")
  const [password, setPassword] = useState("")
  const [passwordRepeat, setPasswordRepeat] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function validate(): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`
    }
    if (password !== passwordRepeat) {
      return "Die Passwörter stimmen nicht überein."
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const validationError = validate()
    if (validationError) {
      setFormError(validationError)
      return
    }
    setSubmitting(true)
    const result = await setPasswordFromLinkAction(token, password)
    setSubmitting(false)
    if ("error" in result) {
      if (result.error.includes("ungültig")) {
        setPageError(result.error)
        setPageState("error")
      } else setFormError(result.error)
      return
    }
    setPageState("success")
    // Voller Seitenaufruf, damit die Middleware die neue Sitzung sieht.
    window.location.href = result.redirectTo
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: "#f0f4f8" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ backgroundColor: "#0f2137" }}
          >
            <Briefcase size={22} style={{ color: "#4ba3c3" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">Kandidatenwerk</h1>
            <p className="mt-1 text-sm text-gray-500">Passwort festlegen</p>
          </div>
        </div>

        <div
          className="rounded-2xl border bg-white p-6 shadow-sm"
          style={{ borderColor: "#dde3ea" }}
        >
          {pageState === "error" && (
            <div className="flex flex-col gap-4">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {pageError ?? "Dieser Link ist ungültig."}
              </p>
              <p className="text-sm text-gray-600">
                Einen neuen Link bekommst du vom Team oder über „Passwort vergessen?“ beim Login:
              </p>
              <Link
                href="/login"
                className="text-center text-sm font-medium hover:underline"
                style={{ color: "#1e56a0" }}
              >
                Zum Login
              </Link>
            </div>
          )}

          {pageState === "success" && (
            <div className="flex flex-col gap-4">
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">
                Passwort erfolgreich gesetzt. Du wirst weitergeleitet…
              </p>
              <p className="text-center text-sm text-gray-500">
                Falls die Weiterleitung nicht automatisch startet:{" "}
                <Link href="/dashboard" className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                  Zum Dashboard
                </Link>
                {" "}oder{" "}
                <Link href="/login" className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                  zum Login
                </Link>
              </p>
            </div>
          )}

          {pageState === "ready" && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Neues Passwort
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
                    "placeholder:text-gray-400",
                    "focus:border-[#1e56a0] focus:ring-2 focus:ring-[#1e56a0]/20",
                    "border-[#dde3ea]"
                  )}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="passwordRepeat" className="text-sm font-medium text-gray-700">
                  Passwort wiederholen
                </label>
                <input
                  id="passwordRepeat"
                  name="passwordRepeat"
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={passwordRepeat}
                  onChange={(e) => setPasswordRepeat(e.target.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
                    "placeholder:text-gray-400",
                    "focus:border-[#1e56a0] focus:ring-2 focus:ring-[#1e56a0]/20",
                    "border-[#dde3ea]"
                  )}
                />
              </div>

              {formError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  "mt-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity",
                  "disabled:opacity-60"
                )}
                style={{ backgroundColor: "#1e56a0" }}
              >
                {submitting ? "Wird gespeichert…" : "Passwort festlegen"}
              </button>
            </form>
          )}
        </div>
        <LegalLinks className="mt-6 text-gray-400" />
      </div>
    </div>
  )
}
