"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { useShowMode } from "@/lib/show-mode"
import { SAMPLE_BERUFSBILDER } from "@/lib/berufsbild-samples"
import { createSampleCandidatesAction } from "./actions"

const inputClass = "w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1"
const inputStyle = { borderColor: "#dde3ea" }

// "Musterdatensätze hinzufügen" (Paket 41): Berufsbild und PLZ des Kunden eingeben, die KI
// erstellt drei fiktive Kandidaten im Umkreis. Im anonymisierten Modus ausgeblendet.
export function SampleCandidatesButton() {
  const router = useRouter()
  const [showMode] = useShowMode()
  const [open, setOpen] = useState(false)
  const [berufsbild, setBerufsbild] = useState<string>(SAMPLE_BERUFSBILDER[0].value)
  const [plz, setPlz] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  if (showMode) return null

  function close() {
    if (pending) return
    setOpen(false)
    setError(null)
    setDone(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    startTransition(async () => {
      const res = await createSampleCandidatesAction(berufsbild, plz)
      if ("error" in res) {
        setError(res.error)
        return
      }
      setDone(res.count)
      router.refresh()
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50"
        style={{ borderColor: "#1e56a0", color: "#1e56a0" }}
      >
        <Sparkles size={15} />
        Musterdatensätze hinzufügen
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-md rounded-xl border bg-white shadow-xl" style={{ borderColor: "#dde3ea" }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={submit} className="flex flex-col gap-3 p-6">
              <h2 className="text-base font-semibold text-gray-900">Musterdatensätze hinzufügen</h2>
              <p className="text-xs text-gray-500">
                Die KI erstellt drei fiktive, vorqualifizierte Kandidaten (weiblich oder männlich) mit Wohnort im Umkreis von 15 km.
                Sie bekommen den Tag „Musterdatensatz“. Das dauert etwa eine Minute.
              </p>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                Berufsbild
                <select value={berufsbild} onChange={(e) => setBerufsbild(e.target.value)} className={inputClass} style={{ ...inputStyle, backgroundColor: "white" }} disabled={pending}>
                  {SAMPLE_BERUFSBILDER.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
                PLZ des Kunden
                <input
                  value={plz}
                  onChange={(e) => setPlz(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="z. B. 20095"
                  inputMode="numeric"
                  required
                  className={inputClass}
                  style={inputStyle}
                  disabled={pending}
                />
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              {done !== null && <p className="text-xs text-green-700">{done} Musterdatensätze angelegt.</p>}
              <div className="mt-2 flex justify-end gap-2">
                <button type="button" onClick={close} disabled={pending} className="rounded-md border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50" style={inputStyle}>
                  {done !== null ? "Schließen" : "Abbrechen"}
                </button>
                <button type="submit" disabled={pending || plz.length !== 5} className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
                  {pending ? "KI erstellt Datensätze…" : "Erstellen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
