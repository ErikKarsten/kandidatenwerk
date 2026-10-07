import { DATENSCHUTZ_URL, IMPRESSUM_URL } from "@/lib/legal-links"
import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"

export function LegalLinks({ className, linkClassName, style }: { className?: string; linkClassName?: string; style?: CSSProperties }) {
  const link = cn("hover:underline", linkClassName)
  return (
    <p className={cn("flex justify-center gap-3 text-xs", className)} style={style}>
      <a href={IMPRESSUM_URL} target="_blank" rel="noopener noreferrer" className={link}>
        Impressum
      </a>
      <span aria-hidden="true">·</span>
      <a href={DATENSCHUTZ_URL} target="_blank" rel="noopener noreferrer" className={link}>
        Datenschutz
      </a>
    </p>
  )
}
