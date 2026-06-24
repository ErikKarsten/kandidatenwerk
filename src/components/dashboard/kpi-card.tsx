import Link from "next/link"
import { type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface KpiCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  href?: string
  trend?: {
    value: number
    label?: string
  }
  iconColor?: string
}

export function KpiCard({ icon: Icon, label, value, href, trend, iconColor = "#1e56a0" }: KpiCardProps) {
  const trendPositive = trend && trend.value >= 0

  const inner = (
    <>
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${iconColor}18` }}
      >
        <Icon size={20} style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-gray-900">{value}</p>
        {trend && (
          <p className={cn("mt-1 text-xs font-medium", trendPositive ? "text-emerald-600" : "text-red-500")}>
            {trendPositive ? "+" : ""}
            {trend.value}% {trend.label ?? "zum Vormonat"}
          </p>
        )}
      </div>
    </>
  )

  const cardClass = "rounded-xl border bg-white p-5 flex items-start gap-4"
  const cardStyle = { borderColor: "#dde3ea" }

  if (href) {
    return (
      <Link
        href={href}
        className={cn(cardClass, "transition-shadow hover:shadow-md hover:border-gray-300")}
        style={cardStyle}
      >
        {inner}
      </Link>
    )
  }

  return (
    <div className={cardClass} style={cardStyle}>
      {inner}
    </div>
  )
}
