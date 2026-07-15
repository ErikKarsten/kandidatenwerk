// Kanonische Kandidaten-Pipeline-Status, siehe CANDIDATE_STATUSES in
// src/app/dashboard/campaigns/[id]/settings-tab.tsx. Wird für den unabhängigen
// Match-Status in candidate_campaign_matches wiederverwendet, damit beide konsistent bleiben.
export const CANDIDATE_STATUS_OPTIONS = [
  { value: "neu", label: "Neu", bg: "#4ba3c318", dot: "#4ba3c3", text: "#0e7490" },
  { value: "interview", label: "Interview", bg: "#1e56a018", dot: "#1e56a0", text: "#1e56a0" },
  { value: "vorgestellt", label: "Vorgestellt", bg: "#8b5cf618", dot: "#8b5cf6", text: "#7c3aed" },
  { value: "platziert", label: "Platziert", bg: "#1a9a6a18", dot: "#1a9a6a", text: "#1a9a6a" },
  { value: "abgelehnt", label: "Abgelehnt", bg: "#9ca3af18", dot: "#9ca3af", text: "#6b7280" },
] as const
