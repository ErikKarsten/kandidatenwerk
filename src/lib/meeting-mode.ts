"use client"

import { useLocalStorageValue } from "@/lib/use-local-storage"

// Terminmodus (Paket 46/49): beim Kundentermin die eigene Plattform zeigen - interne
// Kommentare, Einstellungen und Aktionen ausgeblendet. Gilt je Browser für Kunden- und
// Kampagnenansicht, bleibt also beim Wechsel vom Kunden in eine Kampagne an.
export function useMeetingMode(): [boolean, (on: boolean) => void] {
  return useLocalStorageValue("kandidatenwerk_meeting_mode", (raw) => raw === "true", false)
}
