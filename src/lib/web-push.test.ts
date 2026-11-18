import { describe, expect, it } from "vitest"
import { base64UrlDecode, base64UrlEncode, encryptPayload, vapidAuthorization } from "./web-push"

const encoder = new TextEncoder()

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
  const infoBytes = typeof info === "string" ? encoder.encode(info) : info
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: infoBytes }, key, length * 8))
}

// Entschlüsselt wie ein Browser (RFC 8291) - prüft, dass encryptPayload standardkonform ist.
async function decryptAsBrowser(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array<ArrayBuffer>): Promise<string> {
  const salt = body.slice(0, 16)
  const idLen = body[20]
  const asPublic = body.slice(21, 21 + idLen)
  const ciphertext = body.slice(21 + idLen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey))
  const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, [])
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, ua.privateKey, 256))
  const info = new Uint8Array([...encoder.encode("WebPush: info\0"), ...uaPublic, ...asPublic])
  const ikm = await hkdf(auth, secret, info, 32)
  const cek = await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const nonce = await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12)
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext))
  expect(plain[plain.length - 1]).toBe(2)
  return new TextDecoder().decode(plain.slice(0, -1))
}

describe("web-push", () => {
  it("verschlüsselt so, dass ein Browser den Inhalt lesen kann", async () => {
    const ua = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair
    const auth = crypto.getRandomValues(new Uint8Array(16))
    const p256dh = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", ua.publicKey)))
    const payload = JSON.stringify({ title: "🔴 Kampagnen offline", body: "Seit 10:00 Uhr keine Einblendungen." })

    const body = await encryptPayload(payload, { p256dh, auth: base64UrlEncode(auth) })
    expect(new DataView(body.buffer, body.byteOffset).getUint32(16)).toBe(4096)
    expect(await decryptAsBrowser(body, ua, auth)).toBe(payload)
  })

  it("signiert das VAPID-Token prüfbar mit dem öffentlichen Schlüssel", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair
    const publicKey = base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)))
    const privateKey = (await crypto.subtle.exportKey("jwk", pair.privateKey)).d as string

    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", { publicKey, privateKey, subject: "https://example.org" })
    const match = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)
    expect(match).not.toBeNull()
    const [, h, c, s, k] = match!
    expect(k).toBe(publicKey)
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c)))).toMatchObject({ aud: "https://fcm.googleapis.com", sub: "https://example.org" })
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, base64UrlDecode(s), encoder.encode(`${h}.${c}`))
    expect(valid).toBe(true)
  })
})
