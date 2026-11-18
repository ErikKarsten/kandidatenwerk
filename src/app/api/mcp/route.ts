import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { pruefeSchluessel } from "@/lib/claude-api/schluessel"
import { bearbeiteRpc } from "@/lib/claude-api/mcp"
import { checkApiKeyFailureRateLimit } from "@/lib/ratelimit"

// Claude-Schnittstelle (Paket 111): MCP-Server für Claude Code. Anmeldung mit persönlichem
// API-Schlüssel eines Agentur-Admins (Einstellungen → Mein Konto → Claude-Zugang).
const MAX_BYTES = 200_000

function nichtAngemeldet(meldung: string, status = 401) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: meldung } },
    { status, headers: { "WWW-Authenticate": 'Bearer realm="Kandidatenwerk"' } }
  )
}

export async function POST(request: NextRequest) {
  const admin = createSupabaseAdminClient()
  const zugang = await pruefeSchluessel(admin as unknown as SupabaseClient, request.headers.get("authorization"))
  if (!zugang) {
    const ip = request.headers.get("cf-connecting-ip")
    if (!(await checkApiKeyFailureRateLimit(ip))) return nichtAngemeldet("Zu viele Fehlversuche. Bitte kurz warten.", 429)
    return nichtAngemeldet("API-Schlüssel fehlt, ist ungültig oder widerrufen (nur für Agentur-Admins).")
  }

  const roh = await request.text()
  if (roh.length > MAX_BYTES) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Anfrage zu groß." } }, { status: 413 })
  let nachricht: unknown
  try {
    nachricht = JSON.parse(roh)
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Kein gültiges JSON." } }, { status: 400 })
  }

  const liste = Array.isArray(nachricht) ? nachricht : [nachricht]
  if (liste.length === 0 || liste.length > 20) return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Ungültige Anfrage." } }, { status: 400 })
  const antworten = []
  for (const n of liste) {
    const a = await bearbeiteRpc(admin, zugang, n as Parameters<typeof bearbeiteRpc>[2])
    if (a) antworten.push(a)
  }
  // Nur Benachrichtigungen: angenommen, keine Antwort.
  if (antworten.length === 0) return new NextResponse(null, { status: 202 })
  return NextResponse.json(Array.isArray(nachricht) ? antworten : antworten[0])
}

// Kein Server-Ereignisstrom (zustandsloser Server) - siehe MCP "Streamable HTTP".
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } })
}

export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } })
}
