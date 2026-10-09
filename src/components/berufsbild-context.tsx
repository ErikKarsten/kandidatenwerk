"use client"

import { createContext, useContext, useMemo } from "react"
import { BERUFSBILD_OPTIONS, berufsbildChoices, berufsbildLabel, type BerufsbildOption } from "@/lib/berufsbild"

// Berufsbilder aus den Einstellungen (Paket 45) für alle Client-Komponenten - geladen im
// Dashboard- bzw. Portal-Layout.
const BerufsbildContext = createContext<BerufsbildOption[]>(BERUFSBILD_OPTIONS)

export function BerufsbildProvider({ options, children }: { options: BerufsbildOption[]; children: React.ReactNode }) {
  return <BerufsbildContext.Provider value={options}>{children}</BerufsbildContext.Provider>
}

export function useBerufsbilder() {
  const options = useContext(BerufsbildContext)
  return useMemo(
    () => ({
      all: options,
      // Aktive Berufsbilder plus ggf. der aktuelle (deaktivierte) Wert.
      choices: (current?: string | null) => berufsbildChoices(options, current),
      label: (value: string | null | undefined) => berufsbildLabel(value, options),
    }),
    [options]
  )
}
