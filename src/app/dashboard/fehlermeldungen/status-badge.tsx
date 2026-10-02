import { BUG_REPORT_STATUS_OPTIONS, type BugReportStatus } from "@/lib/bug-reports/shared"

export function BugReportStatusBadge({ status }: { status: BugReportStatus }) {
  const option = BUG_REPORT_STATUS_OPTIONS.find((o) => o.value === status)
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: option?.bg ?? "#9ca3af18", color: option?.color ?? "#6b7280" }}
    >
      {option?.label ?? status}
    </span>
  )
}
