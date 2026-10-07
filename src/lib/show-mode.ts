"use client"

// Show-Modus (Paket 28, T-110): Kandidaten vor Kunden vorführen wie in einer Banking-App
// mit ausgeblendeten Beträgen - Name wird zur Kennung, Kontakt, PLZ/Wohnort, Erreichbarkeit
// und interne Tags (Musterdatensatz) verschwinden. Gilt in "Alle Kandidaten" und im
// Seitenfenster; Einstellung je Browser.
import { cvReference } from "@/lib/cv"
import { useLocalStorageValue } from "@/lib/use-local-storage"

export function useShowMode(): [boolean, (on: boolean) => void] {
  return useLocalStorageValue("kandidatenwerk_show_mode", (raw) => raw === "true", false)
}

export function anonymousName(candidateId: string): string {
  return `Kandidat:in ${cvReference(candidateId)}`
}

// Zusatzfelder, die im Show-Modus nie gezeigt werden.
export const PERSONAL_FIELD_KEYS = new Set(["erreichbarkeit", "wohnort_plz"])

// E-Mail-Adressen und Telefonnummern in Freitexten (Beschreibung) ausblenden.
export function maskContactData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "•••")
    .replace(/(?:\+|\b0)\d[\d ()/-]{6,}\d/g, "•••")
}
