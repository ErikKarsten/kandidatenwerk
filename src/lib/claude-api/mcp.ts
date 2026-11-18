// MCP-Server der Claude-Schnittstelle (Paket 111): Model Context Protocol über HTTP
// ("Streamable HTTP", zustandslos, Antworten als JSON). Claude Code verbindet sich mit
//   claude mcp add --transport http kandidatenwerk <APP>/api/mcp --header "Authorization: Bearer kw_…"
// Unterstützt: initialize, ping, tools/list, tools/call (+ Benachrichtigungen ohne Antwort).
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { WERKZEUGE, WerkzeugFehler } from "@/lib/claude-api/werkzeuge"
import type { ApiZugang } from "@/lib/claude-api/schluessel"

const VERSIONEN = ["2025-06-18", "2025-03-26", "2024-11-05"]

const ANLEITUNG = `Kandidatenwerk ist das Recruiting-System von Kanzleistelle24 / Endlich Mitarbeiter: Kandidaten (Bewerber für Steuerkanzleien), Kunden (Kanzleien), Kampagnen und Aufgaben.
Arbeite in dieser Reihenfolge: erst suchen bzw. anzeigen, dann ändern. IDs kommen immer aus den Such- und Anzeige-Werkzeugen.
Änderungen wirken wie in der Oberfläche (Verlauf, Automatisierungen, Mails). Vor Schritten, die Mails an Kanzleien oder Kandidaten auslösen können (Kanzlei zuordnen, Status ändern), kurz mit dem Nutzer abstimmen.
Löschen ist über diese Schnittstelle nicht möglich.`

interface RpcAnfrage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

type RpcAntwort = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

const fehler = (id: RpcAnfrage["id"], code: number, message: string): RpcAntwort => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

// Argumente fürs Protokoll kürzen (keine langen Texte speichern).
function kurz(args: unknown): unknown {
  if (!args || typeof args !== "object") return args
  return Object.fromEntries(Object.entries(args as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v]))
}

async function rufeWerkzeug(db: SupabaseClient<Database>, zugang: ApiZugang, params: Record<string, unknown> | undefined) {
  const name = typeof params?.name === "string" ? params.name : ""
  const args = (params?.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>
  const werkzeug = WERKZEUGE.find((w) => w.name === name)
  const protokoll = async (ok: boolean, meldung: string | null) => {
    const { error } = await (db as unknown as SupabaseClient)
      .from("api_protokoll")
      .insert({ schluessel_id: zugang.schluesselId, profile_id: zugang.profileId, werkzeug: name.slice(0, 80) || "?", argumente: kurz(args), ok, fehler: meldung?.slice(0, 500) ?? null })
    if (error) console.error("[mcp] Protokoll fehlgeschlagen:", error.message)
  }
  if (!werkzeug) {
    await protokoll(false, "Unbekanntes Werkzeug")
    return null
  }
  try {
    const ergebnis = await werkzeug.run(db, { userId: zugang.profileId, siehtActiveSourcing: zugang.siehtActiveSourcing }, args)
    await protokoll(true, null)
    return { content: [{ type: "text", text: JSON.stringify(ergebnis, null, 2) }], structuredContent: ergebnis, isError: false }
  } catch (err) {
    const bekannt = err instanceof WerkzeugFehler
    const meldung = bekannt ? err.message : "Interner Fehler in Kandidatenwerk."
    if (!bekannt) console.error(`[mcp] ${name} fehlgeschlagen:`, err)
    await protokoll(false, bekannt ? meldung : String(err instanceof Error ? err.message : err))
    return { content: [{ type: "text", text: meldung }], isError: true }
  }
}

export async function bearbeiteRpc(db: SupabaseClient<Database>, zugang: ApiZugang, anfrage: RpcAnfrage): Promise<RpcAntwort | null> {
  if (anfrage?.jsonrpc !== "2.0" || typeof anfrage.method !== "string") return fehler(anfrage?.id, -32600, "Ungültige Anfrage.")
  // Benachrichtigungen (ohne id) bekommen keine Antwort.
  if (anfrage.id === undefined) return null
  switch (anfrage.method) {
    case "initialize": {
      const gewuenscht = typeof anfrage.params?.protocolVersion === "string" ? anfrage.params.protocolVersion : ""
      return {
        jsonrpc: "2.0",
        id: anfrage.id,
        result: {
          protocolVersion: VERSIONEN.includes(gewuenscht) ? gewuenscht : VERSIONEN[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "kandidatenwerk", title: "Kandidatenwerk", version: "1.0.0" },
          instructions: `${ANLEITUNG}\nAngemeldet als: ${zugang.name}.`,
        },
      }
    }
    case "ping":
      return { jsonrpc: "2.0", id: anfrage.id, result: {} }
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: anfrage.id,
        result: { tools: WERKZEUGE.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) },
      }
    case "tools/call": {
      const ergebnis = await rufeWerkzeug(db, zugang, anfrage.params)
      if (!ergebnis) return fehler(anfrage.id, -32602, `Unbekanntes Werkzeug: ${String(anfrage.params?.name ?? "")}`)
      return { jsonrpc: "2.0", id: anfrage.id, result: ergebnis }
    }
    default:
      return fehler(anfrage.id, -32601, `Methode nicht unterstützt: ${anfrage.method}`)
  }
}
