"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { resolveDuplicateCaseAction, runDuplicateCheckAction, type DuplicateCaseView } from "./duplicate-actions"

const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  ignoriert: "Ignoriert",
  zusammengefuehrt: "Zusammengeführt",
  geloescht: "Gelöscht",
}

// Sektion "Dubletten" (Paket 14, T-66): Kunden- und Kandidatendubletten mit
// Zusammenführen / Ignorieren / Löschen. Ignorierte Fälle tauchen nicht wieder auf.
export function DuplicatesSection({ cases, showAll }: { cases: DuplicateCaseView[]; showAll: boolean }) {
  const router = useRouter()
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCheck() {
    setMessage(null)
    startTransition(async () => {
      const result = await runDuplicateCheckAction()
      if ("error" in result) return setMessage({ ok: false, text: result.error })
      setMessage({ ok: true, text: result.newCases > 0 ? `${result.newCases} neue Verdachtsfälle gefunden.` : "Keine neuen Verdachtsfälle." })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Link
            href="/dashboard/fehlermeldungen?bereich=dubletten"
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={!showAll ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "white" } : { backgroundColor: "white", borderColor: "#dde3ea", color: "#374151" }}
          >
            Offen
          </Link>
          <Link
            href="/dashboard/fehlermeldungen?bereich=dubletten&status=alle"
            className="rounded-full border px-3 py-1 text-xs font-medium"
            style={showAll ? { backgroundColor: "#1e56a0", borderColor: "#1e56a0", color: "white" } : { backgroundColor: "white", borderColor: "#dde3ea", color: "#374151" }}
          >
            Alle
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className="text-xs" style={{ color: message.ok ? "#1a9a6a" : "#dc2626" }}>
              {message.text}
            </span>
          )}
          <button
            type="button"
            onClick={handleCheck}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            style={{ backgroundColor: "#1e56a0" }}
          >
            <RefreshCw size={13} className={pending ? "animate-spin" : undefined} />
            {pending ? "Prüft…" : "Jetzt auf Dubletten prüfen"}
          </button>
        </div>
      </div>

      {cases.length === 0 ? (
        <p className="rounded-xl border bg-white p-6 text-sm text-gray-500" style={{ borderColor: "#dde3ea" }}>
          Keine Dubletten in dieser Ansicht.
        </p>
      ) : (
        cases.map((c) => <CaseCard key={c.id} c={c} />)
      )}
    </div>
  )
}

function CaseCard({ c }: { c: DuplicateCaseView }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>(c.records[0]?.id ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const open = c.status === "offen"
  const kindLabel = c.kind === "kunde" ? "Kundendublette" : "Kandidatendublette"
  const selectedName = c.records.find((r) => r.id === selected)?.name ?? ""

  function run(action: "zusammenfuehren" | "ignorieren" | "loeschen") {
    if (action === "loeschen" && !confirm(`„${selectedName}“ endgültig löschen?`)) return
    if (action === "zusammenfuehren" && !confirm(`Alle anderen Einträge in „${selectedName}“ zusammenführen? Die anderen werden danach gelöscht.`)) return
    setError(null)
    startTransition(async () => {
      const result = await resolveDuplicateCaseAction(c.id, action, action === "ignorieren" ? undefined : selected)
      if (result?.error) return setError(result.error)
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border bg-white p-4" style={{ borderColor: "#dde3ea" }}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={c.kind === "kunde" ? { backgroundColor: "#1e56a018", color: "#1e56a0" } : { backgroundColor: "#8b5cf618", color: "#7c3aed" }}
        >
          {kindLabel}
        </span>
        <span className="text-sm text-gray-700">{c.reason}</span>
        {!open && <span className="ml-auto text-xs text-gray-400">{STATUS_LABEL[c.status] ?? c.status}</span>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {c.records.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer gap-2 rounded-lg border p-3"
            style={{ borderColor: open && selected === r.id ? "#1e56a0" : "#dde3ea" }}
          >
            {open && <input type="radio" name={`case-${c.id}`} checked={selected === r.id} onChange={() => setSelected(r.id)} className="mt-1" />}
            <span className="min-w-0">
              <Link href={r.href} target="_blank" className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
                {r.name}
              </Link>
              <span className="block text-xs text-gray-500">{r.details.join(" · ")}</span>
              <span className="block text-xs text-gray-400">angelegt {new Date(r.createdAt).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}</span>
            </span>
          </label>
        ))}
      </div>
      {open && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Ausgewählt: {selectedName}</span>
          <button type="button" disabled={pending} onClick={() => run("zusammenfuehren")} className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
            Zusammenführen (Auswahl behalten)
          </button>
          <button type="button" disabled={pending} onClick={() => run("loeschen")} className="rounded-md border px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50" style={{ borderColor: "#fca5a5" }}>
            Auswahl löschen
          </button>
          <button type="button" disabled={pending} onClick={() => run("ignorieren")} className="rounded-md border px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50" style={{ borderColor: "#dde3ea" }}>
            Ignorieren – keine Dublette
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  )
}
