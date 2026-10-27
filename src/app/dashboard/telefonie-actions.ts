"use server"

// Telefonie über sipgate neo (Paket 92): Kandidaten aus Kandidatenwerk anrufen und die
// Einrichtung (eigenes Telefon, Push-API) in den Einstellungen.
import type { SupabaseClient } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getStaffContext } from "@/lib/auth-guards"
import { normalizePhone } from "@/lib/phone"
import {
  SipgateError,
  getSipgateIoSettings,
  listSipgateDevices,
  listSipgateUsers,
  setSipgateIoUrls,
  sipgateConfigured,
  sipgateWebhookUrl,
  startSipgateCall,
  type SipgateDevice,
} from "@/lib/sipgate"

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

function failure(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof SipgateError || err instanceof Error ? err.message : String(err) }
}

// sipgate-Nutzer und Gerät eines Teammitglieds: gespeichert, sonst über die E-Mail gefunden
// (Standardgerät) und gemerkt.
async function resolveSipgate(userId: string): Promise<{ sipgateUserId: string; deviceId: string } | { error: string }> {
  const admin = createSupabaseAdminClient()
  const { data: me } = await admin.from("profiles").select("email, sipgate_user_id, sipgate_device_id").eq("id", userId).single()
  if (me?.sipgate_user_id && me.sipgate_device_id) return { sipgateUserId: me.sipgate_user_id, deviceId: me.sipgate_device_id }
  const users = await listSipgateUsers()
  const match = users.find((u) => u.email && u.email === (me?.email ?? "").toLowerCase())
  if (!match) return { error: "Zu deiner E-Mail-Adresse gibt es keinen sipgate-Nutzer. Bitte unter Einstellungen → Mein Konto dein sipgate-Telefon wählen." }
  const deviceId = me?.sipgate_device_id || match.defaultDevice
  if (!deviceId) return { error: "Für deinen sipgate-Nutzer ist kein Standardgerät eingestellt. Bitte unter Einstellungen → Mein Konto ein Telefon wählen." }
  await admin.from("profiles").update({ sipgate_user_id: match.id, sipgate_device_id: deviceId }).eq("id", userId)
  return { sipgateUserId: match.id, deviceId }
}

export async function startCandidateCallAction(candidateId: string): Promise<Result<{ message: string }>> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return { ok: false, error: guard.error }
  if (!sipgateConfigured()) return { ok: false, error: "sipgate ist noch nicht verbunden. Ein Admin richtet das unter Einstellungen → Mein Konto ein." }
  // Über die Sitzung des Nutzers: wer den Kandidaten nicht sehen darf, kann ihn nicht anrufen.
  const { data: candidate } = await supabase.from("candidates").select("id, phone").eq("id", candidateId).maybeSingle()
  if (!candidate) return { ok: false, error: "Kandidat nicht gefunden." }
  const number = normalizePhone(candidate.phone)
  if (!number || number.length < 8) return { ok: false, error: "Für den Kandidaten ist keine gültige Telefonnummer hinterlegt." }
  try {
    const target = await resolveSipgate(guard.staff.userId)
    if ("error" in target) return { ok: false, error: target.error }
    const callSid = await startSipgateCall(target.deviceId, number)
    const db = createSupabaseAdminClient() as unknown as SupabaseClient
    await db.from("candidate_calls").insert({ candidate_id: candidateId, user_id: guard.staff.userId, direction: "out", number, call_sid: callSid })
    return { ok: true, message: "Dein Telefon klingelt gleich - nach dem Abnehmen wird der Kandidat angerufen." }
  } catch (err) {
    return failure(err)
  }
}

export interface MySipgate {
  configured: boolean
  sipgateUser: { id: string; name: string } | null
  deviceId: string | null
  devices: SipgateDevice[]
  error?: string
}

export async function loadMySipgateAction(): Promise<MySipgate> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return { configured: false, sipgateUser: null, deviceId: null, devices: [], error: guard.error }
  if (!sipgateConfigured()) return { configured: false, sipgateUser: null, deviceId: null, devices: [] }
  try {
    const admin = createSupabaseAdminClient()
    const { data: me } = await admin.from("profiles").select("email, sipgate_user_id, sipgate_device_id").eq("id", guard.staff.userId).single()
    const users = await listSipgateUsers()
    const user = users.find((u) => u.id === me?.sipgate_user_id) ?? users.find((u) => u.email === (me?.email ?? "").toLowerCase()) ?? null
    if (!user) return { configured: true, sipgateUser: null, deviceId: null, devices: [], error: "Zu deiner E-Mail-Adresse gibt es keinen sipgate-Nutzer." }
    const devices = await listSipgateDevices(user.id)
    return {
      configured: true,
      sipgateUser: { id: user.id, name: `${user.firstname} ${user.lastname}`.trim() || user.email },
      deviceId: me?.sipgate_device_id ?? user.defaultDevice,
      devices,
    }
  } catch (err) {
    return { configured: true, sipgateUser: null, deviceId: null, devices: [], error: failure(err).error }
  }
}

export async function saveMySipgateDeviceAction(sipgateUserId: string, deviceId: string): Promise<Result> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return { ok: false, error: guard.error }
  try {
    // Nur Geräte des eigenen sipgate-Nutzers (über die E-Mail geprüft).
    const admin = createSupabaseAdminClient()
    const { data: me } = await admin.from("profiles").select("email").eq("id", guard.staff.userId).single()
    const users = await listSipgateUsers()
    const user = users.find((u) => u.id === sipgateUserId)
    if (!user || user.email !== (me?.email ?? "").toLowerCase()) return { ok: false, error: "Dieser sipgate-Nutzer gehört nicht zu deinem Konto." }
    const devices = await listSipgateDevices(user.id)
    if (!devices.some((d) => d.id === deviceId)) return { ok: false, error: "Gerät nicht gefunden." }
    await admin.from("profiles").update({ sipgate_user_id: user.id, sipgate_device_id: deviceId }).eq("id", guard.staff.userId)
    return { ok: true }
  } catch (err) {
    return failure(err)
  }
}

export interface SipgateAdminStatus {
  configured: boolean
  webhookActive: boolean
  otherUrls: string[]
  error?: string
}

async function requireAdmin(): Promise<{ error: string } | null> {
  const supabase = await createSupabaseServerClient()
  const guard = await getStaffContext(supabase)
  if ("error" in guard) return guard
  return guard.staff.role === "agency_admin" ? null : { error: "Nur für Admins." }
}

export async function sipgateAdminStatusAction(): Promise<SipgateAdminStatus> {
  const denied = await requireAdmin()
  if (denied) return { configured: false, webhookActive: false, otherUrls: [], error: denied.error }
  if (!sipgateConfigured()) return { configured: false, webhookActive: false, otherUrls: [] }
  try {
    const [settings, url] = await Promise.all([getSipgateIoSettings(), sipgateWebhookUrl()])
    const urls = [settings.incomingUrl, settings.outgoingUrl].filter(Boolean)
    return { configured: true, webhookActive: settings.incomingUrl === url && settings.outgoingUrl === url, otherUrls: [...new Set(urls.filter((u) => u !== url))] }
  } catch (err) {
    return { configured: true, webhookActive: false, otherUrls: [], error: failure(err).error }
  }
}

// Push-API auf Kandidatenwerk einstellen. Sind dort schon andere Adressen eingetragen, nur
// mit ausdrücklicher Bestätigung (replace), sonst würde eine andere Anbindung abgeschaltet.
export async function setupSipgateWebhookAction(replace: boolean): Promise<Result> {
  const denied = await requireAdmin()
  if (denied) return { ok: false, error: denied.error }
  try {
    const [settings, url] = await Promise.all([getSipgateIoSettings(), sipgateWebhookUrl()])
    const others = [settings.incomingUrl, settings.outgoingUrl].filter((u) => u && u !== url)
    if (others.length && !replace) return { ok: false, error: "In sipgate sind schon andere Webhook-Adressen eingetragen." }
    await setSipgateIoUrls(url)
    return { ok: true }
  } catch (err) {
    return failure(err)
  }
}
