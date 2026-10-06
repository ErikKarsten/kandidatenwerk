import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { processInboundItem, type InboundItem } from "@/lib/inbound-replies"

// Brevo Inbound Parsing (Paket 19, T-89): eingehende Antworten an *@antwort.kanzleistelle24.de.
// Brevo signiert nicht - geschützt über ein geheimes Token in der URL (BREVO_INBOUND_TOKEN),
// eingerichtet per scripts/brevo-inbound-setup.ts.
function validToken(provided: string | null): boolean {
  const expected = process.env.BREVO_INBOUND_TOKEN
  if (!expected || !provided) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!validToken(request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  let payload: { items?: InboundItem[] } | InboundItem
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 })
  }
  const items = "items" in payload && Array.isArray(payload.items) ? payload.items : [payload as InboundItem]
  const db = createSupabaseAdminClient()
  const outcomes: string[] = []
  try {
    for (const item of items) outcomes.push(await processInboundItem(db, item))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[brevo-inbound] ${message}`)
    return NextResponse.json({ error: message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, outcomes })
}
