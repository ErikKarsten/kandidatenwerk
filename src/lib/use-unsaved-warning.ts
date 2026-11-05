"use client"

import { useEffect } from "react"

// Paket 99: Ungespeicherter Text geht nicht mehr unbemerkt verloren, wenn jemand die Seite
// neu lädt oder den Tab schließt (z. B. weil sie zu hängen scheint). Der Browser fragt dann
// mit seinem eigenen Hinweis nach, ob man die Seite wirklich verlassen will.
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Ältere Browser brauchen zusätzlich returnValue.
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
}
