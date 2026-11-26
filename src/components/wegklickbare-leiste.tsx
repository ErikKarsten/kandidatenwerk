"use client"
// Rote Hinweisleiste, die man wegklicken kann (Paket 116). Gemerkt je Browser über den
// `schluessel`: Ändert sich die Meldung (neuer Alarm, weiteres Formular), erscheint sie wieder.
import { useEffect, useState, type ReactNode } from "react"
import { X } from "lucide-react"

const PREFIX = "kw-leiste-weg:"

export function WegklickbareLeiste({ schluessel, children }: { schluessel: string; children: ReactNode }) {
  // null = noch nicht gelesen: erst nach dem Lesen zeigen, damit eine weggeklickte Leiste
  // nicht kurz aufblitzt.
  const [weg, setWeg] = useState<boolean | null>(null)

  useEffect(() => {
    let gemerkt = false
    try {
      gemerkt = window.localStorage.getItem(PREFIX + schluessel) === "1"
    } catch {
      // Speicher gesperrt (privates Fenster): Leiste einfach zeigen.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage ist erst im Browser lesbar
    setWeg(gemerkt)
  }, [schluessel])

  if (weg !== false) return null

  const wegklicken = () => {
    setWeg(true)
    try {
      window.localStorage.setItem(PREFIX + schluessel, "1")
    } catch {
      // nur für diese Ansicht ausblenden
    }
  }

  return (
    <div role="alert" className="relative mb-4 rounded-xl border py-3 pl-4 pr-10 text-sm" style={{ backgroundColor: "#fef2f2", borderColor: "#fca5a5", color: "#991b1b" }}>
      {children}
      <button
        type="button"
        onClick={wegklicken}
        aria-label="Hinweis ausblenden"
        title="Ausblenden"
        className="absolute right-2 top-2 rounded-md p-1 hover:bg-red-100"
      >
        <X size={16} />
      </button>
    </div>
  )
}
