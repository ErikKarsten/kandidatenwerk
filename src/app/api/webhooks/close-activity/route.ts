import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { recordMeetingFromWebhook, verifyCloseSignature, type CloseWebhookEvent } from "@/lib/close-meetings"

// Close-Webhook für Besprechungen (Paket 17, T-54) - direkt von Close, ohne Zapier.
// Eingerichtet per scripts/close-webhook-setup.ts; signiert mit CLOSE_WEBHOOK_SIGNATURE_KEY.
// Antwortet schnell; die Zusammenfassung erledigt der Cronjob close-meetings.
export async function POST(request: NextRequest) {
  const body = await request.text()
  const ok = verifyCloseSignature(
    body,
    request.headers.get("close-sig-timestamp"),
    request.headers.get("close-sig-hash"),
    process.env.CLOSE_WEBHOOK_SIGNATURE_KEY
  )
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let payload: CloseWebhookEvent
  try {
    payload = JSON.parse(body) as CloseWebhookEvent
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON" }, { status: 400 })
  }

  try {
    const outcome = await recordMeetingFromWebhook(createSupabaseAdminClient() as unknown as SupabaseClient, payload)
    return NextResponse.json({ ok: true, outcome })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[close-activity] ${message}`)
    // 500 -> Close stellt erneut zu.
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
