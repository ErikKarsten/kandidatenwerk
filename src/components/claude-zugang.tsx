"use client"

// Claude-Zugang (Paket 111): persönliche API-Schlüssel, mit denen Claude Code Kandidatenwerk
// steuern kann (MCP-Server /api/mcp). Fürs ganze Team (Paket 112).
import { useEffect, useState, useTransition } from "react"
import { createApiKeyAction, listApiKeysAction, revokeApiKeyAction, type ApiSchluesselZeile } from "@/lib/claude-api/actions"

const BORDER = "#dde3ea"
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "noch nie")

export function ClaudeZugang() {
  const [liste, setListe] = useState<ApiSchluesselZeile[] | null>(null)
  const [name, setName] = useState("")
  const [neu, setNeu] = useState<{ schluessel: string; befehl: string } | null>(null)
  const [kopiert, setKopiert] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const laden = () =>
    listApiKeysAction().then((r) => {
      if ("error" in r) setFehler(r.error)
      else setListe(r.schluessel)
    })
  useEffect(() => {
    laden()
  }, [])

  function anlegen() {
    setFehler(null)
    setKopiert(false)
    startTransition(async () => {
      const r = await createApiKeyAction(name)
      if ("error" in r) return setFehler(r.error)
      setNeu(r)
      setName("")
      await laden()
    })
  }

  function widerrufen(id: string) {
    if (!window.confirm("Schlüssel widerrufen? Claude Code kommt damit dann nicht mehr in Kandidatenwerk.")) return
    startTransition(async () => {
      const r = await revokeApiKeyAction(id)
      if (r?.error) return setFehler(r.error)
      await laden()
    })
  }

  async function kopieren() {
    if (!neu) return
    try {
      await navigator.clipboard.writeText(neu.befehl)
      setKopiert(true)
    } catch {
      setFehler("Kopieren ging nicht - bitte den Befehl markieren und von Hand kopieren.")
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: BORDER }}>
      <h3 className="text-sm font-semibold text-gray-900">Claude-Zugang (API)</h3>
      <p className="mt-1 text-sm text-gray-500">
        Mit einem persönlichen Schlüssel kann Claude Code Kandidatenwerk in deinem Namen und mit deinen Rechten bedienen: Kandidaten, Kanzleien, Kampagnen und Aufgaben suchen und ansehen,
        Status ändern, Notizen und Aufgaben anlegen, Kandidaten zuordnen. Löschen geht darüber nicht. Jeder Aufruf wird protokolliert.
      </p>

      {neu && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "#1a9a6a66", backgroundColor: "#1a9a6a0d" }}>
          <p className="text-sm font-medium text-gray-900">Neuer Schlüssel - wird nur jetzt angezeigt.</p>
          <p className="mt-1 text-xs text-gray-600">Im Terminal einmal ausführen, dann ist Kandidatenwerk in Claude Code verbunden:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-900 p-2 text-xs whitespace-pre-wrap text-gray-100 [overflow-wrap:anywhere]">{neu.befehl}</pre>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={kopieren} className="rounded-md px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: "#1e56a0" }}>
              {kopiert ? "Kopiert ✓" : "Befehl kopieren"}
            </button>
            <button type="button" onClick={() => setNeu(null)} className="rounded-md border px-3 py-1.5 text-sm text-gray-700" style={{ borderColor: BORDER }}>
              Fertig
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, z. B. MacBook Claude Code"
          maxLength={80}
          className="min-w-0 flex-1 rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: BORDER }}
        />
        <button type="button" disabled={pending || !name.trim()} onClick={anlegen} className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: "#1e56a0" }}>
          Schlüssel anlegen
        </button>
      </div>
      {fehler && <p className="mt-2 text-xs text-red-600">{fehler}</p>}

      {liste && liste.length > 0 && (
        <ul className="mt-3 divide-y text-sm" style={{ borderColor: "#eef2f6" }}>
          {liste.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-gray-900">{k.name}</span>
                <span className="block text-xs text-gray-500">
                  {k.praefix}… · angelegt {datum(k.created_at)} · zuletzt benutzt {datum(k.last_used_at)}
                </span>
              </span>
              <button type="button" disabled={pending} onClick={() => widerrufen(k.id)} className="shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-red-50 disabled:opacity-50" style={{ borderColor: "#fca5a5", color: "#dc2626" }}>
                Widerrufen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
