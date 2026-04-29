"use client"

import { useActionState } from "react"
import { loginAction } from "./actions"
import { cn } from "@/lib/utils"

export function LoginForm() {
  const [error, action, isPending] = useActionState(loginAction, null)

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@firma.de"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
            "placeholder:text-gray-400",
            "focus:border-[#1e56a0] focus:ring-2 focus:ring-[#1e56a0]/20",
            "border-[#dde3ea]"
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium text-gray-700">
          Passwort
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          className={cn(
            "rounded-lg border px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors",
            "placeholder:text-gray-400",
            "focus:border-[#1e56a0] focus:ring-2 focus:ring-[#1e56a0]/20",
            "border-[#dde3ea]"
          )}
        />
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className={cn(
          "mt-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity",
          "disabled:opacity-60"
        )}
        style={{ backgroundColor: "#1e56a0" }}
      >
        {isPending ? "Anmelden…" : "Anmelden"}
      </button>
    </form>
  )
}
