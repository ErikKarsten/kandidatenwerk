"use client"

import { useEffect, useMemo, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

export interface MapPoint {
  lat: number | null
  lng: number | null
  label: string
  sublabel?: string
  isSelf?: boolean
}

// Einfache farbige Punkt-Icons statt Leaflets Standard-Marker-Bildern - vermeidet das
// bekannte Problem kaputter Icon-Pfade beim Bundling und passt visuell besser zu den
// Farbpunkten, die im Rest der App für Status/Badges genutzt werden.
function createDotIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 3px rgba(0,0,0,0.5);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
}

const DEFAULT_ICON = createDotIcon("#1e56a0")
const SELF_ICON = createDotIcon("#dc2626")

function hasCoords(p: MapPoint): p is MapPoint & { lat: number; lng: number } {
  return typeof p.lat === "number" && typeof p.lng === "number"
}

export function MatchesMap({ points }: { points: MapPoint[] }) {
  const validPoints = useMemo(() => points.filter(hasCoords), [points])

  // WICHTIG: bewusst useState statt useRef für die Map-Instanz. react-leaflets
  // MapContainer befüllt seinen ref-Wert erst asynchron über einen Folge-Render
  // (useImperativeHandle mit context als Dependency, siehe MapContainer.js) - beim
  // allerersten Commit ist der ref-Wert noch null. Mit useRef würde ein useEffect mit
  // z.B. [validPoints.length] als Dependency dadurch NIE mit einer echten Map-Instanz
  // laufen, wenn sich validPoints zwischen den beiden Renders nicht ändert (verifiziert
  // per Debug-Logging: effect lief mit mapRef.current === null und danach nie wieder).
  // Ein Callback-Ref + useState löst das robust: sobald react-leaflet den Ref-Wert
  // (neu) setzt, feuert setMap erneut und der Effekt unten läuft mit der echten Instanz.
  const [map, setMap] = useState<L.Map | null>(null)

  // Leaflet misst die Container-Größe nur einmal beim Mount und cached sie intern.
  // Ändert sich die Größe danach rein CSS-getrieben (z.B. schmaleres Browserfenster,
  // responsives Grid, Sidebar-Toggle), bleibt die Karte bei der alten Pixel-Größe
  // hängen und wird vom overflow-hidden-Wrapper sichtbar abgeschnitten (Marker landen
  // dann pixelgenau außerhalb des sichtbaren Bereichs - so am realen Bug verifiziert).
  // Der ResizeObserver feuert laut Spec direkt bei observe() einmal initial UND bei
  // jeder späteren Größenänderung - deckt also Mount und nachträgliches Resizing ab.
  useEffect(() => {
    if (!map) return

    const container = map.getContainer()
    const observer = new ResizeObserver(() => {
      map.invalidateSize()
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [map])

  if (validPoints.length < 1) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border bg-white py-12 text-sm text-gray-400"
        style={{ borderColor: "#dde3ea" }}
      >
        Keine Standortdaten verfügbar
      </div>
    )
  }

  const bounds = L.latLngBounds(validPoints.map((p) => [p.lat, p.lng] as [number, number]))

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "#dde3ea" }}>
      <MapContainer
        ref={setMap}
        bounds={bounds}
        boundsOptions={{ padding: [30, 30] }}
        style={{ height: "280px", width: "100%" }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {validPoints.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={p.isSelf ? SELF_ICON : DEFAULT_ICON}>
            <Popup>
              <span className="font-medium">{p.label}</span>
              {p.sublabel && <span className="block text-xs text-gray-500">{p.sublabel}</span>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
