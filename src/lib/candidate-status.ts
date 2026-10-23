// Einzige Quelle für alle Kandidaten-Pipeline-Status (Value, Label, Farben). Seit Paket 15
// (T-71) ohne Interview/Vorgestellt/Platziert - das bildet der Status der Zuordnung beim
// Kunden ab (src/lib/assignment-status.ts). Jede
// Status-UI (Dropdowns, Badges, Filter, Dashboard-Pipeline) importiert von hier statt
// eigene Kopien zu pflegen. Muss mit der candidates_status_check-Constraint in
// supabase/migrations/20260803000000_extend_candidate_status_options.sql synchron bleiben.
export const CANDIDATE_STATUS_OPTIONS = [
  // Neu = Blau, Vorqualifiziert = Grün (Paket 66) - vorher zwei Blautöne, kaum zu unterscheiden.
  { value: "neu", label: "Neu", bg: "#2563eb18", dot: "#2563eb", text: "#1d4ed8" },
  { value: "vorqualifiziert", label: "Vorqualifiziert", bg: "#16a34a1f", dot: "#16a34a", text: "#15803d" },
  { value: "in_pruefung", label: "In Prüfung", bg: "#f59e0b18", dot: "#f59e0b", text: "#b45309" },
  { value: "nicht_erreicht", label: "Nicht erreicht", bg: "#f9731618", dot: "#f97316", text: "#c2410c" },
  { value: "nicht_erreicht_mail", label: "2x nicht erreicht + Mail", bg: "#ef444418", dot: "#ef4444", text: "#b91c1c" },
  { value: "in_kontakt", label: "In Kontakt", bg: "#14b8a618", dot: "#14b8a6", text: "#0f766e" },
  // Paket 85: beim Setzen Aufgabe "in 6 Monaten erneut anrufen" (RECALL_TASK).
  { value: "nicht_auf_suche", label: "Derzeit nicht auf Suche", bg: "#8b5cf618", dot: "#8b5cf6", text: "#6d28d9" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
] as const

export type CandidateStatusValue = (typeof CANDIDATE_STATUS_OPTIONS)[number]["value"]

export const CANDIDATE_STATUS_FALLBACK_COLORS = { bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" }

// Status "Derzeit nicht auf Suche" (Paket 85): Aufgabe, den Kandidaten in 6 Monaten erneut
// anzurufen - für die Person, die den Status gesetzt hat.
export const RECALL_STATUS = "nicht_auf_suche"
export const RECALL_TASK_TITLE = "Kandidat erneut anrufen – derzeit nicht auf Suche"
export const RECALL_AFTER_MONTHS = 6

// Fälligkeit: heute + 6 Monate (Monatsende beachtet, z. B. 31.08. -> 28./29.02.), als JJJJ-MM-TT.
export function recallDueDate(from: Date = new Date(), months = RECALL_AFTER_MONTHS): string {
  const y = from.getUTCFullYear()
  const m = from.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay))).toISOString().slice(0, 10)
}
