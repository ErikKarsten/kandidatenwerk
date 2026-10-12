"use client"

import { useCallback, useEffect } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { backTarget, nextStack, readStack, writeStack } from "@/lib/nav-history"

// Merkt sich die besuchten Seiten für "Zurück" (Paket 53); im Dashboard-Layout eingebunden.
export function NavigationTracker() {
  const pathname = usePathname()
  const search = useSearchParams().toString()
  useEffect(() => {
    const url = search ? `${pathname}?${search}` : pathname
    writeStack(nextStack(readStack(), url))
  }, [pathname, search])
  return null
}

// "Zurück" zur zuletzt besuchten anderen Seite, ohne Formulare; sonst zu `fallback`.
export function useGoBack(fallback: string): () => void {
  const router = useRouter()
  return useCallback(() => {
    const current = `${window.location.pathname}${window.location.search}`
    const { target, rest } = backTarget(readStack(), current, fallback)
    writeStack(rest)
    router.push(target)
  }, [router, fallback])
}
