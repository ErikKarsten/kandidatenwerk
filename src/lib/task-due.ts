// Fälligkeits-Filter für Aufgaben (Paket 48). due_date ist ein reines Datum (YYYY-MM-DD),
// "heute" gilt in deutscher Zeit; die Woche endet am Sonntag.
export type DueFilter = "alle" | "ueberfaellig" | "heute" | "woche" | "ohne"

export const DUE_FILTER_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "alle", label: "Alle Termine" },
  { value: "ueberfaellig", label: "Überfällig" },
  { value: "heute", label: "Heute" },
  { value: "woche", label: "Diese Woche" },
  { value: "ohne", label: "Ohne Datum" },
]

export function berlinDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now)
}

// Sonntag der Woche von `today` (YYYY-MM-DD).
export function weekEnd(today: string): string {
  const d = new Date(`${today}T12:00:00Z`)
  const daysToSunday = (7 - d.getUTCDay()) % 7
  d.setUTCDate(d.getUTCDate() + daysToSunday)
  return d.toISOString().slice(0, 10)
}

export function matchesDue(dueDate: string | null, filter: DueFilter, today: string): boolean {
  const due = dueDate?.slice(0, 10) ?? null
  switch (filter) {
    case "alle":
      return true
    case "ohne":
      return !due
    case "ueberfaellig":
      return !!due && due < today
    case "heute":
      return due === today
    case "woche":
      return !!due && due >= today && due <= weekEnd(today)
  }
}
