"use client"

import { useSyncExternalStore } from "react"

// Mobile Ansicht (Paket 14, T-63): true unterhalb von Tailwinds md-Breakpoint (768px).
const QUERY = "(max-width: 767px)"

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
