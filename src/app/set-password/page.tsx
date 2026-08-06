"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Briefcase } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { cn } from "@/lib/utils"

const MIN_PASSWORD_LENGTH = 8
// Falls überhaupt kein Hash-Fragment vorhanden ist (Seite ohne Einladungslink direkt
// aufgerufen), feuert auth-js nie ein SIGNED_IN/PASSWORD_RECOVERY-Event - ohne Timeout
// würde die Seite dann für immer im "checking"-Zustand hängen bleiben.
const NO_TOKEN_TIMEOUT_MS = 5000

type PageState = "checking" | "ready" | "error" | "success"

// auth-js verarbeitet abgelaufene/ungültige Einladungslinks NICHT über
// onAuthStateChange - im Fehlerfall gibt GoTrueClient._initialize() nur {error}
// zurück, ohne _notifyAllSubscribers("SIGNED_IN"/"PASSWORD_RECOVERY", ...) aufzurufen
// (verifiziert im installierten @supabase/auth-js). Der Fehler steckt stattdessen
// direkt im Hash-Fragment (#error=...&error_code=...&error_description=...) und muss
// deshalb hier selbst ausgelesen werden, bevor der Supabase-Client ihn beim
// Initialisieren verarbeitet.
function readHashError(): string | null {
  if (typeof window === "undefined") return null
  const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash
  if (!raw) return null

  const params = new URLSearchParams(raw)
  const description = params.get("error_description")
  if (description) return description.replace(/\+/g, " ")
  const error = params.get("error")
  return error ? error : null
}

export default function SetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking")
  const [pageError, setPageError] = useState<string | null>(null)

  const [password, setPassword] = useState("")
  const [passwordRepeat, setPasswordRepeat] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Hash-Fehler zuerst und synchron auslesen - bevor der Supabase-Client (dessen
    // Initialisierung asynchron läuft) das Hash-Fragment bei Erfolg löscht.
    const hashError = readHashError()
    if (hashError) {
      setPageError(hashError)
      setPageState("error")
      return
    }

    const supabase = createClient()

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY") {
        setPageState("ready")
      }
    })

    const timeout = setTimeout(() => {
      setPageState((current) => {
        if (current !== "checking") return current
        setPageError("Kein gültiger Einladungslink gefunden.")
        return "error"
      })
    }, NO_TOKEN_TIMEOUT_MS)

    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timeout)
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
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setFormError(error.message)
      return
    }

    setPageState("success")

    // Voller Reload statt router.push(): der Browser-Client aus src/lib/supabase.ts
    // nutzt createBrowserClient aus @supabase/ssr, der die Session per Cookie
    // speichert (nicht nur localStorage) - genau dafür gedacht, dass die Middleware
    // (middleware.ts) und createSupabaseServerClient() dieselbe Session sehen. Ein
    // kompletter Seitenaufruf stellt sicher, dass die Middleware mit den aktuellen
    // Cookies neu entscheidet, statt sich auf einen rein clientseitigen Router-State
    // zu verlassen.
    window.location.href = "/dashboard"
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
