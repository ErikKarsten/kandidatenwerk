import { NextResponse, type NextRequest } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { normalizePayload, processCloseWebhook, type CloseWebhookPayload } from "@/lib/close-webhook"
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

  // JSON (empfohlen) oder Formular - Zapier steht standardmäßig auf "Form".
  let raw: unknown
  try {
    const contentType = request.headers.get("content-type") ?? ""
    raw = contentType.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries())
  } catch {
    return NextResponse.json({ error: "Daten nicht lesbar - in Zapier Payload Type auf Json stellen." }, { status: 400 })
  }
  const payload: CloseWebhookPayload = normalizePayload(raw)
  // Nur Feldnamen protokollieren (keine Inhalte), um Zuordnungsfehler in Zapier zu finden.
  console.log(`[close-webhook] empfangene Felder: ${Object.keys(payload).join(", ") || "(keine)"}`)

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
