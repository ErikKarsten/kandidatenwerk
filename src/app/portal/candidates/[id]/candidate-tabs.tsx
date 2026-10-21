"use client"

import { useState, type ReactNode } from "react"

// Reiter auf der Kandidatenseite im Kundenportal (Paket 77): Dateien sind damit auf einen
// Blick erreichbar, statt ganz unten unter den Zusatzfeldern zu stehen.
export function PortalCandidateTabs({
  profile,
  files,
  notes,
  fileCount,
  noteCount,
}: {
  profile: ReactNode
  files: ReactNode
  notes: ReactNode
  fileCount: number
  noteCount: number
}) {
  const [tab, setTab] = useState<"profil" | "dateien" | "notizen">("profil")
  const tabs = [
    { key: "profil" as const, label: "Profil" },
    { key: "dateien" as const, label: `Dateien (${fileCount})` },
    { key: "notizen" as const, label: `Notizen (${noteCount})` },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-0 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: "#dde3ea" }} role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className="-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors"
            style={tab === t.key ? { borderColor: "#1e56a0", color: "#1e56a0" } : { borderColor: "transparent", color: "#6b7280" }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "profil" && profile}
      {tab === "dateien" && files}
      {tab === "notizen" && notes}
    </div>
  )
}
