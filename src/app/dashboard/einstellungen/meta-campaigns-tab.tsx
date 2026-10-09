"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { syncMetaCampaignsNowAction } from "./actions"
import type { LeadCampaignOverview } from "@/lib/meta-campaigns-queries"
import { useBerufsbilder } from "@/components/berufsbild-context"

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: "Läuft", bg: "#1a9a6a18", text: "#1a9a6a" },
  paused: { label: "Pausiert", bg: "#f59e0b18", text: "#b45309" },
  completed: { label: "Beendet", bg: "#9ca3af18", text: "#6b7280" },
}

function areaSummary(c: LeadCampaignOverview): string {
  const active = c.areas.filter((a) => a.adsetActive)
  const list = (active.length > 0 ? active : c.areas).map((a) => (a.radiusKm ? `${a.label} (${a.radiusKm} km)` : a.label))
  const unique = [...new Set(list)]
  return unique.length === 0 ? "–" : unique.slice(0, 4).join(", ") + (unique.length > 4 ? ` +${unique.length - 4}` : "")
}

// Einstellungen -> Meta-Kampagnen (Atlas T-38): die aus dem Meta-Werbekonto
// importierten Lead-Kampagnen mit Status, verknüpftem Lead-Formular, Werbegebieten
// und Leads. Abgleich stündlich automatisch oder per Knopf (nur Admins).
export function MetaCampaignsTab({
  campaigns,
  isAdmin,
  warnings = [],
}: {
  campaigns: LeadCampaignOverview[]
  isAdmin: boolean
  warnings?: { campaignId: string; campaignTitle: string; message: string }[]
}) {
  const bb = useBerufsbilder()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [showEnded, setShowEnded] = useState(false)

  const lastSync = campaigns.map((c) => c.metaSyncedAt).filter(Boolean).sort().pop() ?? null
  const visible = showEnded ? campaigns : campaigns.filter((c) => c.status === "active")

  function handleSync() {
    setMessage(null)
    startTransition(async () => {
      const result = await syncMetaCampaignsNowAction()
      if ("error" in result) {
        setMessage({ type: "error", text: result.error })
        return
      }
      const base = `${result.created} neu, ${result.updated} aktualisiert, ${result.formsLinked} Formulare verknüpft, ${result.areas} Werbegebiete.`
      setMessage(
        result.errors.length > 0
          ? { type: "error", text: `${base} Hinweise: ${result.errors.join(" · ")}` }
          : { type: "success", text: base }
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-gray-900">Meta-Kampagnen</h2>
          <p className="mt-1 max-w-xl text-xs text-gray-500">
            <strong className="text-gray-700">Importiert und ausgewertet werden ausschließlich Kampagnen, deren Name mit „KS24“ beginnt</strong> – alle anderen
            Kampagnen im Werbekonto werden ignoriert, auch in den Auswertungen. Neue KS24-Kampagnen erscheinen automatisch (stündlicher Abgleich), das
            Lead-Formular wird verknüpft und die Leads laufen in „Alle Kandidaten“ ein. Die Werbegebiete stehen auf der
            Karte unter „Werbegebiete“.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Letzter Abgleich: {lastSync ? new Date(lastSync).toLocaleString("de-DE", { timeZone: "Europe/Berlin" }) : "noch nie"}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={handleSync}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : undefined} />
            {pending ? "Gleiche ab… (kann eine Minute dauern)" : "Jetzt von Meta abgleichen"}
          </button>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border px-4 py-3 text-xs" style={{ borderColor: "#f59e0b66", backgroundColor: "#fffbeb", color: "#92400e" }}>
          <p className="font-medium">Leads dieser Kampagnen werden nicht abgeholt – die Facebook-Seite ist dem Meta-Systemnutzer nicht freigegeben:</p>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((w) => (
              <li key={w.campaignId}>{w.campaignTitle}</li>
            ))}
          </ul>
          <p className="mt-1">Im Meta Business Manager die Seite dem Systemnutzer zuweisen, dann klappt der Abruf automatisch.</p>
        </div>
      )}

      {message && (
        <p className="text-xs" style={{ color: message.type === "success" ? "#1a9a6a" : "#dc2626" }}>
          {message.text}
        </p>
      )}

      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        <input type="checkbox" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
        Pausierte und beendete Kampagnen anzeigen ({campaigns.filter((c) => c.status !== "active").length})
      </label>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-400">
          {campaigns.length === 0 ? "Noch keine Meta-Kampagnen importiert." : "Keine laufenden Kampagnen."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "#dde3ea" }}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500" style={{ borderColor: "#eef2f6" }}>
                <th className="px-3 py-2 font-medium">Kampagne</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Werbegebiete</th>
                <th className="px-3 py-2 font-medium">Formular</th>
                <th className="px-3 py-2 font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const st = STATUS_STYLE[c.status] ?? STATUS_STYLE.completed
                return (
                  <tr key={c.id} className="border-b last:border-0 align-top" style={{ borderColor: "#eef2f6" }}>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                        {c.title}
                      </Link>
                      <div className="text-xs text-gray-400">
                        {bb.label(c.berufsbild) ?? "Berufsbild offen"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: st.bg, color: st.text }}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{areaSummary(c)}</td>
                    <td className="px-3 py-2 text-xs">
                      {c.metaFormId ? (
                        <span style={{ color: "#1a9a6a" }}>verknüpft</span>
                      ) : (
                        <span className="text-amber-700">kein Formular</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">
                      {c.leadsTotal}
                      {c.leadsUnassigned > 0 && <span className="text-gray-400"> ({c.leadsUnassigned} nicht zugeordnet)</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
