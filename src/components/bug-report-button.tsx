"use client"

import { useState, useTransition } from "react"
import { usePathname } from "next/navigation"
import { Bug } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { submitBugReportAction } from "@/lib/bug-reports/actions"
import { BUG_REPORT_DESCRIPTION_MAX, BUG_REPORT_TITLE_MAX } from "@/lib/bug-reports/shared"

const inputClass = "w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

// "Fehler melden"-Button für beide Seitenleisten (Dashboard und Kunden-Portal, Atlas
// T-26). Was nach dem Absenden passiert, entscheidet der Server anhand der Rolle:
// Team-Meldungen werden direkt zur Aufgabe, Kunden-Meldungen gehen erst zur Prüfung.
export function BugReportButton({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<"task_created" | "pending_review" | null>(null)
  const [pending, startTransition] = useTransition()

  function openDialog() {
    setTitle("")
    setDescription("")
    setError(null)
    setDone(null)
    setOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await submitBugReportAction({ title, description, pageUrl: pathname })
      if ("error" in result) {
        setError(result.error)
        return
      }
      setDone(result.outcome)
    })
  }

  const trigger = (
    <button
      type="button"
      onClick={openDialog}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/10 hover:text-white",
        collapsed && "justify-center px-0"
      )}
      style={{ color: "rgba(219, 234, 254, 0.7)" }}
    >
      <Bug size={18} className="shrink-0" />
      {!collapsed && <span>Fehler melden</span>}
    </button>
  )

  return (
    <>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">Fehler melden</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border bg-white shadow-xl" style={{ borderColor: "#dde3ea" }}>
            {done ? (
              <div className="flex flex-col gap-3 p-6">
                <h2 className="text-base font-semibold text-gray-900">Danke für die Meldung</h2>
                <p className="text-sm text-gray-600">
                  {done === "task_created"
                    ? "Die Meldung ist als Aufgabe angelegt und erscheint unter Aufgaben."
                    : "Die Meldung wurde an das Team weitergegeben und wird geprüft."}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="self-start rounded-md px-4 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: "#1e56a0" }}
                >
                  Schließen
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6">
                <h2 className="text-base font-semibold text-gray-900">Fehler melden</h2>
                <p className="text-xs text-gray-500">
                  Die aktuelle Seite wird automatisch mitgeschickt.
                </p>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    Was funktioniert nicht?<span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    maxLength={BUG_REPORT_TITLE_MAX}
                    className={inputClass}
                    style={inputStyle}
                    placeholder="z.B. Status lässt sich nicht speichern"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-600">
                    Beschreibung<span className="ml-0.5 text-red-500">*</span>
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                    rows={5}
                    maxLength={BUG_REPORT_DESCRIPTION_MAX}
                    className={`${inputClass} resize-none`}
                    style={inputStyle}
                    placeholder="Was hast du gemacht, was hast du erwartet, was ist passiert?"
                  />
                </div>

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    style={{ backgroundColor: "#1e56a0" }}
                  >
                    {pending ? "Wird gesendet…" : "Meldung senden"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={pending}
                    className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
                  >
                    Abbrechen
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
