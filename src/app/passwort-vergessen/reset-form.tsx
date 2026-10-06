"use client"

import { useActionState } from "react"
import { requestPasswordResetAction } from "./actions"

export function ResetForm() {
  const [state, action, isPending] = useActionState(requestPasswordResetAction, null)

  if (state?.ok) {
    return <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-700">{state.message}</p>
  }

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
          className="rounded-lg border border-[#dde3ea] px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-[#1e56a0] focus:ring-2 focus:ring-[#1e56a0]/20"
        />
      </div>
      {state && !state.ok && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="mt-1 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor: "#1e56a0" }}
      >
        {isPending ? "Wird gesendet…" : "Link anfordern"}
      </button>
    </form>
  )
}
