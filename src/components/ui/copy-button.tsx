"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

// Inhalt eines Feldes mit einem Klick in die Zwischenablage (Paket 66). Bei leerem Wert
// unsichtbar, aber mit reserviertem Platz - Eingabefelder bleiben untereinander bündig.
export function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const empty = !value.trim()

  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      disabled={empty}
      tabIndex={empty ? -1 : undefined}
      aria-hidden={empty || undefined}
      title={copied ? "Kopiert" : "In Zwischenablage kopieren"}
      aria-label="In Zwischenablage kopieren"
      className={`shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 ${empty ? "invisible" : ""} ${className}`}
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
    </button>
  )
}
