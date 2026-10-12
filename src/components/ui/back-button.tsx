"use client"

import { useGoBack } from "@/components/navigation-tracker"

// "Zurück" für Server Components (Paket 53): zur zuletzt besuchten anderen Seite ohne
// Formulare (eigener Verlauf statt router.back(), das nach dem Anlegen im Kreis lief),
// sonst zu `fallback`. Icon/Text/Styling kommen per children/className.
export function BackButton({
  className,
  children,
  fallback = "/dashboard",
}: {
  className?: string
  children: React.ReactNode
  fallback?: string
}) {
  const goBack = useGoBack(fallback)

  return (
    <button type="button" onClick={goBack} className={className}>
      {children}
    </button>
  )
}
