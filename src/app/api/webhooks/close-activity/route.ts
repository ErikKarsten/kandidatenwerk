import { NextResponse, type NextRequest } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { ACTIVITY_DELETED, recordActivityFromWebhook, verifyCloseSignature, type CloseWebhookEvent } from "@/lib/close-sync"
import { isOnboardingStatus, queueOnboarding } from "@/lib/close-onboarding"

// Close-Webhook für Aktivitäten (Paket 17, T-54; Paket 30, T-127) - direkt von Close, ohne
// Zapier. Eingerichtet per scripts/close-webhook-setup.ts; signiert mit
// CLOSE_WEBHOOK_SIGNATURE_KEY. Besprechungen, Telefonate, Notizen, eigene Aktivitäten und
// Lead-Statuswechsel; "Gewonnen" bzw. "Folgebesprechung zum SC" startet die Übernahme des
// Kunden. Antwortet schnell; die eigentliche Arbeit erledigt der Cronjob close-meetings.
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
    const db = createSupabaseAdminClient() as unknown as SupabaseClient
    const ev = payload.event
    // Erst die Aktivität (frisch aus Close): ist sie dort schon wieder gelöscht, z. B. ein
    // versehentlich gesetzter und zurückgenommener Status, startet keine Übernahme (Paket 68).
    const outcome = await recordActivityFromWebhook(db, payload)
    let onboarding = false
    if (outcome !== ACTIVITY_DELETED && ev?.object_type === "activity.lead_status_change" && ev.action === "created") {
      const leadId = ev.data?.lead_id ?? ev.lead_id
      const label = ev.data?.new_status_label
      if (leadId && label && isOnboardingStatus(label)) {
        onboarding = await queueOnboarding(db, leadId, label, ev.data?.date_created ?? null)
      }
    }
    return NextResponse.json({ ok: true, outcome, onboarding })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[close-activity] ${message}`)
    // 500 -> Close stellt erneut zu.
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
