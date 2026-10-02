"use client"

import { useCallback, useSyncExternalStore } from "react"

// localStorage-Wert als React-State, ohne setState-im-useEffect (react-hooks/
// set-state-in-effect). Über useSyncExternalStore rendert der Server und der erste
// Client-Render mit serverValue (kein Hydration-Mismatch), danach übernimmt React den
// gespeicherten Wert. Gleicher Effekt wie das bisherige "nach dem Mount aus
// localStorage lesen"-Muster in Sidebar, Kampagnen-Ansicht und Seitengröße.

const LOCAL_CHANGE_EVENT = "kandidatenwerk:local-storage"

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange)
  window.addEventListener(LOCAL_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(LOCAL_CHANGE_EVENT, onChange)
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

// parse bekommt den Rohwert (null = nicht gesetzt) und liefert den Wert; muss für
// gleiche Eingaben gleiche (primitive) Werte liefern, sonst rendert React endlos.
export function useLocalStorageValue<T extends string | number | boolean>(
  key: string,
  parse: (raw: string | null) => T,
  serverValue: T
): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => parse(readStorage(key)),
    () => serverValue
  )

  const setValue = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, String(next))
      } catch {
        // z.B. Private Mode ohne Storage - Wert gilt dann nur nicht über Reloads hinweg
      }
      window.dispatchEvent(new Event(LOCAL_CHANGE_EVENT))
    },
    [key]
  )

  return [value, setValue]
}
