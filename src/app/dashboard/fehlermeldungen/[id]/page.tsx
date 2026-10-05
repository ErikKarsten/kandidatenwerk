import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { requireAgencyAdmin } from "@/lib/auth-guards"
import { getBugReport } from "@/lib/bug-reports/queries"
import { BugReportStatusBadge } from "../status-badge"
import { ReviewActions } from "./review-actions"

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })
}

export default async function BugReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServerClient()
  const guard = await requireAgencyAdmin(supabase)
  if ("error" in guard || !guard.staff.agencyId) notFound()

  const { id } = await params
  const report = await getBugReport(guard.staff.agencyId, id)
  if (!report) notFound()

  const rows: [string, string][] = [
    ["Herkunft", report.clientName ? `Kunden-Portal · ${report.clientName}` : "Team"],
    ["Gemeldet von", report.reporterName],
    ["Gemeldet am", formatDate(report.createdAt)],
    ["Seite", report.pageUrl ?? "–"],
    ["Browser", report.userAgent ?? "–"],
  ]

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8" style={{ backgroundColor: "#f0f4f8", minHeight: "100%" }}>
      <Link href="/dashboard/fehlermeldungen" className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft size={16} /> Zurück zu den Fehlermeldungen
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
        <BugReportStatusBadge status={report.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
            <h2 className="mb-2 text-sm font-semibold text-gray-900">Beschreibung</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-700">{report.description}</p>
          </section>

          <section className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Bearbeitung</h2>
            {report.reviewedAt && (
              <p className="mb-2 text-sm text-gray-600">
                {report.reviewerName ? `${report.reviewerName}, ` : ""}
                {formatDate(report.reviewedAt)}
                {report.reviewNote ? `: ${report.reviewNote}` : ""}
              </p>
            )}
            {report.task && (
              <p className="mb-3 text-sm text-gray-600">
                Aufgabe <Link href="/dashboard/tasks" className="font-medium text-[#1e56a0] hover:underline">„{report.task.title}“</Link>{" "}
                · {report.task.status}
                {report.task.assigneeName ? ` · zugewiesen an ${report.task.assigneeName}` : ""}
              </p>
            )}
            <ReviewActions reportId={report.id} status={report.status} />
          </section>
        </div>

        <section className="h-fit rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Details</h2>
          <dl className="flex flex-col gap-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-gray-500">{label}</dt>
                <dd className="break-words text-gray-800">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  )
}
