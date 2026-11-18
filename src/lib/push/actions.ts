"use server"

// Browser-Benachrichtigungen ein-/ausschalten (Paket 108, Kampagnen-Alarm). Nur Team.
// push_abos hat keine RLS-Policy - Zugriff per Service-Rolle nach eigener Prüfung.
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext } from "@/lib/auth-guards"
import { pushAnAlle } from "@/lib/meta-zentral"

function db(): SupabaseClient {
  return createSupabaseAdminClient() as unknown as SupabaseClient
}

export async function getPushPublicKeyAction(): Promise<string | null> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return null
  return process.env.VAPID_PUBLIC_KEY?.trim() || null
}

export async function savePushSubscriptionAction(input: {
  endpoint: string
  p256dh: string
  auth: string
  geraet?: string
}): Promise<{ error: string } | null> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  if (!/^https:\/\//.test(input.endpoint ?? "") || !input.p256dh || !input.auth) return { error: "Ungültiges Gerät." }

  // Gleiches Gerät mit anderem Login: Eintrag übernimmt der aktuelle Login.
  const { error } = await db()
    .from("push_abos")
    .upsert(
      {
        profile_id: guard.staff.userId,
        endpoint: input.endpoint.slice(0, 1000),
        p256dh: input.p256dh.slice(0, 200),
        auth: input.auth.slice(0, 100),
        geraet: input.geraet?.slice(0, 200) || null,
      },
      { onConflict: "endpoint" }
    )
  return error ? { error: error.message } : null
}

export async function deletePushSubscriptionAction(endpoint: string): Promise<{ error: string } | null> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  const { error } = await db().from("push_abos").delete().eq("endpoint", endpoint).eq("profile_id", guard.staff.userId)
  return error ? { error: error.message } : null
}

export async function sendTestPushAction(): Promise<{ error: string } | { delivered: number }> {
  const guard = await getStaffContext(await createSupabaseServerClient())
  if ("error" in guard) return guard
  try {
    const delivered = await pushAnAlle(
      db(),
      { title: "🔔 Test: Benachrichtigungen funktionieren", body: "So meldet sich Kandidatenwerk, wenn die Kampagnen offline gehen.", tag: "kampagnen-test", url: "/dashboard" },
      false,
      guard.staff.userId
    )
    return { delivered }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
