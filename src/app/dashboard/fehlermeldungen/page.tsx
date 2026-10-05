import Link from "next/link"
import { notFound } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireAgencyAdmin } from "@/lib/auth-guards"
import { getBugReportAssigneeSettings, listBugReports } from "@/lib/bug-reports/queries"
import { BUG_REPORT_STATUS_OPTIONS, OPEN_BUG_REPORT_STATUSES, type BugReportStatus } from "@/lib/bug-reports/shared"
import { BugReportStatusBadge } from "./status-badge"
import { AssigneeSelect } from "./assignee-select"
import { DuplicatesSection } from "./duplicates-section"
import { listDuplicateCases } from "./duplicate-actions"

const FILTERS = [
  { value: "offen", label: "Offen" },
  ...BUG_REPORT_STATUS_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
  { value: "alle", label: "Alle" },
]

// Admin-Übersicht "Fehler melden" (Atlas T-26) - nur für Agentur-Admins.
export default async function BugReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; bereich?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard || !guard.staff.agencyId) notFound()
  const agencyId = guard.staff.agencyId

  const sp = await searchParams
  const filter = FILTERS.some((f) => f.value === sp.status) ? sp.status! : "offen"
  const statuses: BugReportStatus[] | null =
    filter === "alle" ? null : filter === "offen" ? OPEN_BUG_REPORT_STATUSES : [filter as BugReportStatus]

  const bereich = sp.bereich === "dubletten" ? "dubletten" : "meldungen"
  const [reports, assigneeSettings, duplicateCases, openReports, openDuplicates] = await Promise.all([
    listBugReports(agencyId, statuses),
    getBugReportAssigneeSettings(agencyId),
    bereich === "dubletten" ? listDuplicateCases(sp.status === "alle" ? "alle" : "offen") : Promise.resolve([]),
    listBugReports(agencyId, OPEN_BUG_REPORT_STATUSES),
    listDuplicateCases("offen"),
  ])

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fehlermeldungen</h1>
          <p className="mt-1 text-sm text-gray-500">
            Meldungen aus Team und Kunden-Portal sowie vom System (fehlgeschlagene Hintergrundjobs). Kunden-Meldungen werden erst
            nach Freigabe zur Aufgabe.
          </p>
        </div>
        <AssigneeSelect team={assigneeSettings.team} assigneeId={assigneeSettings.assigneeId} />
      </div>

      <div className="flex gap-0 border-b" style={{ borderColor: "#dde3ea" }}>
        {[
          { value: "meldungen", label: `Fehlermeldungen (${openReports.length})`, href: "/dashboard/fehlermeldungen" },
          { value: "dubletten", label: `Dubletten (${openDuplicates.length})`, href: "/dashboard/fehlermeldungen?bereich=dubletten" },
        ].map((t) => (
          <Link
            key={t.value}
            href={t.href}
            className="px-4 py-2.5 text-sm font-medium"
            style={bereich === t.value ? { color: "#1e56a0", borderBottom: "2px solid #1e56a0", marginBottom: -1 } : { color: "#6b7280" }}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {bereich === "dubletten" ? (
        <DuplicatesSection cases={duplicateCases} showAll={sp.status === "alle"} />
      ) : (
      <>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/dashboard/fehlermeldungen?status=${f.value}`}
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={
              f.value === filter
                ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "white" }
                : { backgroundColor: "white", borderColor: "#dde3ea", color: "#374151" }
            }
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-white" style={{ borderColor: "#dde3ea" }}>
        {reports.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Keine Meldungen in dieser Ansicht.</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "#eef2f6" }}>
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/fehlermeldungen/${r.id}`} className="flex flex-col gap-1 px-5 py-4 hover:bg-gray-50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{r.title}</span>
                    <BugReportStatusBadge status={r.status} />
                    {r.source === "system" && (
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: "#6b728018", color: "#4b5563" }}>
                        System{r.occurrences > 1 ? ` · ${r.occurrences}×` : ""}
                      </span>
                    )}
                  </div>
                  <p className="line-clamp-2 text-sm text-gray-600">{r.description}</p>
                  <p className="text-xs text-gray-400">
                    {r.source === "system" ? "System" : r.clientName ? `Kunden-Portal · ${r.clientName}` : `Team · ${r.reporterName}`} ·{" "}
                    {new Date(r.createdAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}
                    {r.source === "system" && r.lastSeenAt ? ` · zuletzt ${new Date(r.lastSeenAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
                    {r.task ? ` · Aufgabe: ${r.task.status}` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      </>
      )}
    </div>
  )
}
