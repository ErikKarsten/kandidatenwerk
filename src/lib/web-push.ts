// Browser-Benachrichtigungen (Web Push) für den Kampagnen-Alarm (Paket 108).
//
// Eigene Umsetzung mit WebCrypto statt der Bibliothek "web-push": die braucht Node-Krypto
// (createECDH, https), die es im Cloudflare-Worker nicht gibt.
//   - Verschlüsselung des Inhalts nach RFC 8291 (aes128gcm)
//   - Absender-Nachweis (VAPID) nach RFC 8292
// Schlüssel: VAPID_PUBLIC_KEY (65 Byte, base64url) und VAPID_PRIVATE_KEY (32 Byte,
// base64url) in .env.local bzw. .env.staging. Erzeugen: scripts/vapid-schluessel.mjs.

export interface PushSubscriptionKeys {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushResult {
  ok: boolean
  status: number
  // 404/410: Das Gerät hat das Abo beendet - Eintrag löschen.
  gone: boolean
}

const encoder = new TextEncoder()

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4)
  const binary = atob(padded)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, length: number): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8))
}

// Verschlüsselt den Inhalt für ein Gerät (RFC 8291). `serverKeys` nur für Tests, sonst
// pro Nachricht ein neues Schlüsselpaar.
export async function encryptPayload(
  payload: string,
  sub: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  options: { serverKeys?: CryptoKeyPair; salt?: Uint8Array<ArrayBuffer> } = {}
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(sub.p256dh)
  const authSecret = base64UrlDecode(sub.auth)
  const serverKeys =
    options.serverKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair)
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeys.publicKey))
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, serverKeys.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12)

  // Ein einziger Datensatz: Inhalt + Trennbyte 0x02 (letzter Datensatz), kein Auffüllen.
  const plaintext = concat(encoder.encode(payload), new Uint8Array([2]))
  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, plaintext))

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext)
}

async function importVapidPrivateKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = base64UrlDecode(publicKey)
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY ist kein gültiger P-256-Schlüssel.")
  return crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: base64UrlEncode(pub.slice(1, 33)), y: base64UrlEncode(pub.slice(33, 65)), d: privateKey, ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  )
}

// VAPID-Kopfzeile (RFC 8292): signiertes Token für den Push-Dienst des Geräts.
export async function vapidAuthorization(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }): Promise<string> {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))
  const claims = base64UrlEncode(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: keys.subject }))
  )
  const key = await importVapidPrivateKey(keys.publicKey, keys.privateKey)
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`)))
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`
}

export function vapidKeysFromEnv(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return null
  // Kontaktangabe für die Push-Dienste: die Adresse der App (keine persönliche Mail).
  const subject = (process.env.NEXT_PUBLIC_APP_URL || "https://kandidatenwerk.kanzleistelle24.de").replace(/\/+$/, "")
  return { publicKey, privateKey, subject }
}

export async function sendWebPush(
  sub: PushSubscriptionKeys,
  message: { title: string; body: string; tag?: string; url?: string },
  options: { ttlSeconds?: number; urgent?: boolean } = {}
): Promise<PushResult> {
  const keys = vapidKeysFromEnv()
  if (!keys) throw new Error("VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY sind nicht gesetzt.")
  const body = await encryptPayload(JSON.stringify(message), sub)
  const response = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(options.ttlSeconds ?? 6 * 3600),
      Urgency: options.urgent ? "high" : "normal",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  })
  return { ok: response.ok, status: response.status, gone: response.status === 404 || response.status === 410 }
}
