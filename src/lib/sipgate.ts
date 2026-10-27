// sipgate neo (Paket 92): Click-to-Call und Einrichtung der Push-API über die REST-API
// (https://api.sipgate.com/v2). Zugang über einen persönlichen Zugangstoken des Admins
// (Worker-Secrets SIPGATE_TOKEN_ID und SIPGATE_TOKEN, Rechte: rtcm:write, users:read,
// devices:read, settings:sipgateio:read und :write). Nur auf dem Server verwenden.
const API = "https://api.sipgate.com/v2"

export function sipgateConfigured(): boolean {
  return !!(process.env.SIPGATE_TOKEN_ID && process.env.SIPGATE_TOKEN)
}

export class SipgateError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

async function sipgateFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const id = process.env.SIPGATE_TOKEN_ID
  const token = process.env.SIPGATE_TOKEN
  if (!id || !token) throw new SipgateError("sipgate ist noch nicht verbunden (Zugangstoken fehlt).", 0)
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Basic ${btoa(`${id}:${token}`)}`,
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
  })
  const text = await res.text()
  if (!res.ok) throw new SipgateError(friendlySipgateError(res.status, text), res.status)
  return (text ? JSON.parse(text) : {}) as T
}

// Verständliche Meldungen für die häufigsten Fehler.
export function friendlySipgateError(status: number, body = ""): string {
  if (status === 401) return "sipgate lehnt den Zugangstoken ab - bitte Token-ID und Token prüfen."
  if (status === 402) return "Das sipgate-Guthaben reicht für den Anruf nicht."
  if (status === 403) {
    return /sipgate\.io/i.test(body)
      ? "sipgate.io ist für euer Konto nicht gebucht."
      : "sipgate erlaubt diesen Anruf mit dem Zugangstoken nicht (fehlende Rechte oder fremdes Gerät)."
  }
  if (status === 400) return "sipgate hat die Anfrage abgelehnt - meist ist die Telefonnummer oder das Gerät ungültig."
  return `sipgate antwortet mit Fehler ${status}.`
}

export interface SipgateUser {
  id: string
  firstname: string
  lastname: string
  email: string
  defaultDevice: string | null
}

export interface SipgateDevice {
  id: string
  alias: string
  type: string
  online: boolean
}

export async function listSipgateUsers(): Promise<SipgateUser[]> {
  const r = await sipgateFetch<{ items?: Partial<SipgateUser>[] }>("/users")
  return (r.items ?? []).map((u) => ({
    id: u.id ?? "",
    firstname: u.firstname ?? "",
    lastname: u.lastname ?? "",
    email: (u.email ?? "").toLowerCase(),
    defaultDevice: u.defaultDevice ?? null,
  }))
}

export async function listSipgateDevices(userId: string): Promise<SipgateDevice[]> {
  const r = await sipgateFetch<{ items?: Partial<SipgateDevice>[] }>(`/${encodeURIComponent(userId)}/devices`)
  return (r.items ?? []).map((d) => ({ id: d.id ?? "", alias: d.alias ?? d.id ?? "", type: d.type ?? "", online: !!d.online }))
}

// Click-to-Call (neo): erst klingelt das Gerät, nach dem Abnehmen wählt sipgate die Nummer.
export async function startSipgateCall(deviceId: string, targetNumber: string): Promise<string | null> {
  const callerId = process.env.SIPGATE_CALLER_ID?.replace(/\D/g, "") || undefined
  const r = await sipgateFetch<{ callSid?: string }>("/calls", {
    method: "POST",
    body: { deviceId, targetNumber, ...(callerId ? { callerId } : {}) },
  })
  return r.callSid ?? null
}

export interface SipgateIoSettings {
  incomingUrl: string
  outgoingUrl: string
  log: boolean
  whitelist: string[] | null
}

export async function getSipgateIoSettings(): Promise<SipgateIoSettings> {
  const r = await sipgateFetch<Partial<SipgateIoSettings>>("/settings/sipgateio")
  return { incomingUrl: r.incomingUrl ?? "", outgoingUrl: r.outgoingUrl ?? "", log: !!r.log, whitelist: r.whitelist ?? null }
}

// Push-API für das ganze Konto auf Kandidatenwerk zeigen (Version 1, stabil).
export async function setSipgateIoUrls(url: string): Promise<void> {
  await sipgateFetch("/settings/sipgateio", { method: "PUT", body: { incomingUrl: url, outgoingUrl: url, log: false, pushApiVersion: 1 } })
}

// Geheimer Teil der Webhook-Adresse, abgeleitet aus dem Service-Schlüssel - so braucht es
// kein eigenes Secret, und sipgate kennt nur die fertige Adresse.
export async function sipgateWebhookToken(): Promise<string> {
  const secret = process.env.SUPABASE_SECRET_KEY ?? ""
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("sipgate-push-v1"))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 40)
}

export const APP_BASE_URL = "https://kandidatenwerk.kanzleistelle24.de"

export async function sipgateWebhookUrl(): Promise<string> {
  return `${APP_BASE_URL}/api/webhooks/sipgate?token=${await sipgateWebhookToken()}`
}
