"use client"

import NextLink from "next/link"
import { useState, type ComponentProps } from "react"

// Ersatz für next/link in der ganzen App (Paket 99). Next lädt sonst jede Seite vor,
// deren Link gerade sichtbar ist: Seitenleiste, jede Kandidatenzeile, jede Kampagne. Nach
// jedem Speichern geschieht das erneut, weil der Zwischenspeicher dann geleert wird. Live
// gemessen am 05.11.2026: rund 80 % aller Server-Anfragen waren solche Vorab-Ladungen, mit
// je einer vollen Seitenberechnung. Hier wird erst vorgeladen, wenn jemand mit der Maus
// über den Link fährt, ihn per Tastatur ansteuert oder antippt. Ein ausdrücklich gesetztes
// prefetch gilt weiter unverändert.
export default function Link({ prefetch, onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof NextLink>) {
  const [intent, setIntent] = useState(false)
  if (prefetch !== undefined) return <NextLink {...props} prefetch={prefetch} onMouseEnter={onMouseEnter} onFocus={onFocus} onTouchStart={onTouchStart} />
  return (
    <NextLink
      {...props}
      prefetch={intent ? null : false}
      onMouseEnter={(e) => {
        setIntent(true)
        onMouseEnter?.(e)
      }}
      onFocus={(e) => {
        setIntent(true)
        onFocus?.(e)
      }}
      onTouchStart={(e) => {
        setIntent(true)
        onTouchStart?.(e)
      }}
    />
  )
}
