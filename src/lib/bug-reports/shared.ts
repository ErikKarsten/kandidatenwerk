// Gemeinsame Werte für "Fehler melden" (Atlas T-26) - ohne Server-Code, damit auch
// Client-Komponenten sie importieren können. Status-Werte müssen zum CHECK-Constraint
// in supabase/migrations/20261002000001_bug_reports.sql passen.

export const BUG_REPORT_STATUS_OPTIONS = [
  { value: "neu", label: "Neu (wartet auf Prüfung)", color: "#0e7490", bg: "#4ba3c318" },
  { value: "in_pruefung", label: "In Prüfung", color: "#b45309", bg: "#f59e0b18" },
  { value: "freigegeben", label: "Freigegeben (Aufgabe angelegt)", color: "#1e56a0", bg: "#1e56a018" },
  { value: "abgelehnt", label: "Abgelehnt", color: "#6b7280", bg: "#9ca3af18" },
  { value: "erledigt", label: "Erledigt", color: "#1a9a6a", bg: "#1a9a6a18" },
] as const

export type BugReportStatus = (typeof BUG_REPORT_STATUS_OPTIONS)[number]["value"]

// Status, die ein Admin noch bearbeiten muss (Zähler in der Seitenleiste).
export const OPEN_BUG_REPORT_STATUSES: BugReportStatus[] = ["neu", "in_pruefung"]

export const BUG_REPORT_TITLE_MAX = 150
export const BUG_REPORT_DESCRIPTION_MAX = 4000

export type SubmitBugReportResult =
  | { error: string }
  | { ok: true; outcome: "task_created" | "pending_review" }
