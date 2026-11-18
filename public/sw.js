// Service Worker für Browser-Benachrichtigungen (Paket 108: Kampagnen-Alarm).
// Zeigt eingehende Push-Nachrichten an und öffnet beim Antippen Kandidatenwerk.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Kandidatenwerk", {
      body: data.body || "",
      tag: data.tag,
      renotify: Boolean(data.tag),
      icon: "/favicon.ico",
      data: { url: data.url || "/dashboard" },
    })
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
