"use client"

// Kampagnen-Alarm als Browser-Benachrichtigung auf diesem Gerät (Paket 108).
import { useEffect, useState, useTransition } from "react"
import {
  deletePushSubscriptionAction,
  getPushPublicKeyAction,
  savePushSubscriptionAction,
  sendTestPushAction,
} from "@/lib/push/actions"

type Zustand = "laden" | "nicht-moeglich" | "ios-app-noetig" | "blockiert" | "aus" | "an" | "nicht-eingerichtet"

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function geraetName(): string {
  const ua = navigator.userAgent
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Gerät"
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser"
  return `${browser} auf ${os}`
}

export function PushToggle() {
  const [zustand, setZustand] = useState<Zustand>("laden")
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let abbrechen = false
    ;(async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent)
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!abbrechen) setZustand(ios && !standalone ? "ios-app-noetig" : "nicht-moeglich")
        return
      }
      const key = await getPushPublicKeyAction()
      if (abbrechen) return
      if (!key) return setZustand("nicht-eingerichtet")
      setPublicKey(key)
      if (Notification.permission === "denied") return setZustand("blockiert")
      const reg = await navigator.serviceWorker.register("/sw.js")
      const sub = await reg.pushManager.getSubscription()
      if (!abbrechen) setZustand(sub ? "an" : "aus")
    })().catch(() => !abbrechen && setZustand("nicht-moeglich"))
    return () => {
      abbrechen = true
    }
  }, [])

  function einschalten() {
    if (!publicKey) return
    setMeldung(null)
    startTransition(async () => {
      try {
        const erlaubnis = await Notification.requestPermission()
        if (erlaubnis !== "granted") {
          setZustand(erlaubnis === "denied" ? "blockiert" : "aus")
          return
        }
        const reg = await navigator.serviceWorker.register("/sw.js")
        await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
        const json = sub.toJSON()
        const result = await savePushSubscriptionAction({
          endpoint: sub.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          geraet: geraetName(),
        })
        if (result?.error) {
          await sub.unsubscribe()
          setMeldung(result.error)
          return
        }
        setZustand("an")
      } catch (err) {
        setMeldung(err instanceof Error ? err.message : "Einschalten fehlgeschlagen.")
      }
    })
  }

  function ausschalten() {
    setMeldung(null)
    startTransition(async () => {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js")
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await deletePushSubscriptionAction(sub.endpoint)
        await sub.unsubscribe()
      }
      setZustand("aus")
    })
  }

  function testen() {
    setMeldung(null)
    startTransition(async () => {
      const r = await sendTestPushAction()
      setMeldung("error" in r ? r.error : r.delivered > 0 ? `Test an ${r.delivered} Gerät${r.delivered === 1 ? "" : "e"} geschickt.` : "Kein Gerät erreicht - bitte aus- und wieder einschalten.")
    })
  }

  const button = "rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50"
  return (
    <div className="rounded-xl border bg-white p-5" style={{ borderColor: "#dde3ea" }}>
      <h3 className="text-sm font-semibold text-gray-900">Kampagnen-Alarm auf diesem Gerät</h3>
      <p className="mt-1 text-sm text-gray-500">
        Benachrichtigung, wenn Meta die Anzeigen nicht mehr ausspielt (Konto gesperrt, Ausgabenlimit erreicht, keine Einblendungen). Geprüft
        wird alle 30 Minuten, Erinnerung alle 3 Stunden, Entwarnung, sobald es wieder läuft.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {zustand === "laden" && <span className="text-sm text-gray-400">Wird geprüft …</span>}
        {zustand === "aus" && (
          <button type="button" disabled={pending} onClick={einschalten} className={`${button} text-white`} style={{ backgroundColor: "#1e56a0", borderColor: "#1e56a0" }}>
            Auf diesem Gerät einschalten
          </button>
        )}
        {zustand === "an" && (
          <>
            <span className="text-sm font-medium" style={{ color: "#1a9a6a" }}>
              Eingeschaltet
            </span>
            <button type="button" disabled={pending} onClick={testen} className={`${button} text-gray-700 hover:bg-gray-50`} style={{ borderColor: "#dde3ea" }}>
              Test senden
            </button>
            <button type="button" disabled={pending} onClick={ausschalten} className={`${button} text-gray-700 hover:bg-gray-50`} style={{ borderColor: "#dde3ea" }}>
              Ausschalten
            </button>
          </>
        )}
        {zustand === "blockiert" && (
          <span className="text-sm text-amber-700">Benachrichtigungen sind für Kandidatenwerk in diesem Browser blockiert. Bitte in den Browser-Einstellungen erlauben.</span>
        )}
        {zustand === "ios-app-noetig" && (
          <span className="text-sm text-gray-600">
            Auf dem iPhone geht das nur als App: in Safari „Teilen“ → „Zum Home-Bildschirm“, dann Kandidatenwerk dort öffnen und hier einschalten.
          </span>
        )}
        {zustand === "nicht-moeglich" && <span className="text-sm text-gray-600">Dieser Browser unterstützt keine Benachrichtigungen.</span>}
        {zustand === "nicht-eingerichtet" && <span className="text-sm text-gray-600">Benachrichtigungen sind auf dem Server noch nicht eingerichtet.</span>}
      </div>
      {meldung && <p className="mt-2 text-xs text-gray-600">{meldung}</p>}
    </div>
  )
}
