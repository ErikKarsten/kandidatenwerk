"use client"

import { useRouter } from "next/navigation"

// Kleiner Client-Baustein für Server Components, die einen "Zurück"-Link brauchen, der
// echte Browser-Historie nutzt (router.back()) statt fest auf eine Übersichtsseite zu
// verlinken - die aufrufende Seite reicht Icon/Text/Styling per children/className
// durch, damit die Optik unverändert bleibt und nur das Navigations-Verhalten wechselt.
export function BackButton({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <button type="button" onClick={() => router.back()} className={className}>
      {children}
    </button>
  )
}
