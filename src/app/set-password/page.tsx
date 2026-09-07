"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { establishInviteSessionAction, setNewPasswordAction } from "./actions"

const MIN_PASSWORD_LENGTH = 8

type PageState = "checking" | "ready" | "error" | "success"

function readHash(): URLSearchParams | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  if (!raw) return null
  return new URLSearchParams(raw)
}

// auth-js verarbeitet abgelaufene/ungültige Einladungslinks NICHT über
// onAuthStateChange - im Fehlerfall gibt GoTrueClient._initialize() nur {error}
// zurück, ohne _notifyAllSubscribers("SIGNED_IN"/"PASSWORD_RECOVERY", ...) aufzurufen
// (verifiziert im installierten @supabase/auth-js). Der Fehler steckt stattdessen
// direkt im Hash-Fragment (#error=...&error_code=...&error_description=...) und muss
// deshalb hier selbst ausgelesen werden, bevor irgendein Supabase-Client ihn verarbeitet.
function readHashError(params: URLSearchParams): string | null {
  const description = params.get("error_description")
  if (description) return description.replace(/\+/g, " ")
  const error = params.get("error")
  return error ? error : null
}

// Diagnose vom 2026-09-07 (siehe actions.ts für die volle Erklärung): der
// browserseitige Supabase-Client kann diese Tokens NICHT selbst verarbeiten, da
// @supabase/ssr's createBrowserClient() intern immer flowType "pkce" erzwingt, unsere
// Einladungslinks aber klassische implizite Hash-Tokens liefern - GoTrueClient wirft
// dabei intern AuthPKCEGrantCodeExchangeError, die Session bleibt leer. Die Tokens
// werden deshalb hier selbst geparst und an einen Server Action übergeben (siehe
// establishInviteSessionAction), der sie ohne URL-Erkennung direkt per setSession()
// setzt - kein browserseitiger Supabase-Client mehr nötig auf dieser Seite.
function readHashTokens(params: URLSearchParams): { accessToken: string; refreshToken: string } | null {
  const accessToken = params.get("access_token")
  const refreshToken = params.get("refresh_token")
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken }
}

export default function SetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking")
  const [pageError, setPageError] = useState<string | null>(null)

  const [password, setPassword] = useState("")
  const [passwordRepeat, setPasswordRepeat] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const params = readHash()
    if (!params) {
      setPageError("Kein gültiger Einladungslink gefunden.")
      setPageState("error")
      return
    }

    // Hash-Fehler zuerst prüfen (abgelaufener/ungültiger Link).
    const hashError = readHashError(params)
    if (hashError) {
      setPageError(hashError)
      setPageState("error")
      return
    }

    const tokens = readHashTokens(params)
    if (!tokens) {
      setPageError("Kein gültiger Einladungslink gefunden.")
      setPageState("error")
      return
    }

    let cancelled = false
    establishInviteSessionAction(tokens.accessToken, tokens.refreshToken).then((result) => {
      if (cancelled) return
      if (result?.error) {
        setPageError(result.error)
        setPageState("error")
      } else {
        setPageState("ready")
      }
    })

    return () => {
      cancelled = true
    }
  }, [])

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
    const result = await setNewPasswordAction(password)
    setSubmitting(false)

    if ("error" in result) {
      setFormError(result.error)
      return
    }

    setPageState("success")

    // Voller Seitenaufruf statt router.push(): stellt sicher, dass die Middleware mit
    // den aktuellen Cookies (von establishInviteSessionAction/setNewPasswordAction auf
    // dem Server gesetzt) neu entscheidet, statt sich auf clientseitigen Router-State
    // zu verlassen. Ziel haengt von der Rolle ab - Kunden-Portal-Nutzer (role "client")
    // landen im eingeschraenkten Portal statt im internen Dashboard, siehe
    // login/actions.ts und middleware.ts fuer dieselbe Unterscheidung an den anderen
    // Einstiegspunkten.
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
          {pageState === "checking" && (
            <p className="text-center text-sm text-gray-500">Einladungslink wird geprüft…</p>
          )}

          {pageState === "error" && (
            <div className="flex flex-col gap-4">
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {pageError ?? "Dieser Einladungslink ist ungültig oder abgelaufen."}
              </p>
              <p className="text-sm text-gray-600">
                Bitte neue Einladung anfordern, oder zurück zum Login:
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
      </div>
    </div>
  )
}
