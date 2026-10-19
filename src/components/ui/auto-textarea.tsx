"use client"

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react"

// Eingabefeld, das wie ein einzeiliges Feld beginnt, lange Texte aber umbricht und mit dem
// Inhalt in die Höhe wächst (Paket 71) - statt Text, der rechts aus dem Feld läuft.
// submitOnEnter: Enter beendet die Eingabe (Feld verliert den Fokus und speichert über
// onBlur), Umschalt+Enter macht eine neue Zeile.
export function AutoTextarea({
  value,
  submitOnEnter = false,
  className = "",
  onKeyDown,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; submitOnEnter?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onKeyDown={(e) => {
        if (submitOnEnter && e.key === "Enter" && !e.shiftKey) {
          e.preventDefault()
          e.currentTarget.blur()
        }
        onKeyDown?.(e)
      }}
      className={`resize-none overflow-hidden leading-snug ${className}`}
      {...props}
    />
  )
}
