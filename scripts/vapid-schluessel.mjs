// Erzeugt ein Schlüsselpaar für Browser-Benachrichtigungen (Paket 108, src/lib/web-push.ts).
// Ausgabe zum Eintragen in .env.local (Live) bzw. .env.staging - jede Umgebung eigene
// Schlüssel. Wer den Schlüssel wechselt, muss die Benachrichtigungen auf allen Geräten neu
// einschalten.  Aufruf: node scripts/vapid-schluessel.mjs
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))
const b64url = (bytes) => Buffer.from(bytes).toString("base64url")
const { d } = await crypto.subtle.exportKey("jwk", pair.privateKey)
console.log(`VAPID_PUBLIC_KEY=${b64url(raw)}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
