import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { processCloseWebhook, type CloseWebhookPayload } from "@/lib/close-webhook"
import type { SupabaseClient } from "@supabase/supabase-js"

// Zapier ("Webhooks by Zapier" -> POST, JSON) meldet hier gewonnene Kunden aus Close
// (Paket 10). Absicherung über den Header x-webhook-secret = CLOSE_WEBHOOK_SECRET
// (Cloudflare-Secret, gleicher Wert in Zapier). Feldliste: src/lib/close-webhook.ts.
function validSecret(provided: string | null): boolean {
  const expected = process.env.CLOSE_WEBHOOK_SECRET
  if (!expected || !provided) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!validSecret(request.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let payload: CloseWebhookPayload
  try {
    payload = (await request.json()) as CloseWebhookPayload
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON." }, { status: 400 })
  }

  try {
    const db = createSupabaseAdminClient() as unknown as SupabaseClient
    const result = await processCloseWebhook(db, payload)
    console.log(`[close-webhook] ${payload.firma}: ${result.outcome} (${result.filled.length} Angaben)`)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[close-webhook] Fehler bei ${payload.firma ?? "?"}: ${message}`)
    // 4xx bei fehlenden Pflichtfeldern, damit Zapier den Fehler anzeigt statt endlos zu wiederholen.
    return NextResponse.json({ error: message }, { status: /fehlt/.test(message) ? 422 : 500 })
  }
}
