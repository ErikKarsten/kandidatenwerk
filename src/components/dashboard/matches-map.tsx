"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

export interface MapPoint {
  lat: number | null
  lng: number | null
  label: string
  sublabel?: string
  isSelf?: boolean
  // Für Anwendungsfälle jenseits des einfachen "Ich" vs. "Match" (z.B. die Karten-
  // Übersicht in dashboard/map): explizite Farbe statt nur isSelf, ein gestrichelter
  // Rand für Näherungswerte, sowie ein zusätzlicher Hinweistext im Popup dafür.
  color?: string
  approximate?: boolean
  note?: string
  // Optional: macht das Label im Popup zu einem Next.js-Link zur Detailseite. Ohne
  // href bleibt das Label reiner Text - Rückwärtskompatibilität für matches-section.tsx
  // / matches-tab.tsx, die das (noch) nicht setzen.
  href?: string
}

type ValidMapPoint = MapPoint & { lat: number; lng: number }

// Einfache farbige Punkt-Icons statt Leaflets Standard-Marker-Bildern - vermeidet das
// bekannte Problem kaputter Icon-Pfade beim Bundling und passt visuell besser zu den
// Farbpunkten, die im Rest der App für Status/Badges genutzt werden. Gecacht pro
// Farbe/Rand-Kombination (endliche, sehr kleine Anzahl an Varianten), damit nicht bei
// jedem Render pro Marker ein neues L.divIcon-Objekt entsteht.
const iconCache = new Map<string, L.DivIcon>()

function createDotIcon(color: string, dashed = false): L.DivIcon {
  const cacheKey = `${color}|${dashed}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached

  // Gestrichelter Rand in dunklem Grau statt Weiß, damit die Strichelung auf hellen
  // Kartenkacheln überhaupt sichtbar ist (weißer gestrichelter Rand auf hellem
  // Untergrund würde kaum auffallen).
  const border = dashed ? "2px dashed #374151" : "2px solid white"
  const icon = L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:${border};box-shadow:0 0 3px rgba(0,0,0,0.5);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  })
  iconCache.set(cacheKey, icon)
  return icon
}

// Etwas größeres Icon mit zentrierter Zahl für Gruppen mehrerer Punkte am selben
// (gerundeten) Standort - eigener Cache-Namensraum ("group|"-Präfix), damit die Keys
// nicht mit denen von createDotIcon kollidieren.
function createGroupIcon(color: string, dashed: boolean, count: number): L.DivIcon {
  const cacheKey = `group|${color}|${dashed}|${count}`
  const cached = iconCache.get(cacheKey)
  if (cached) return cached

  const border = dashed ? "2px dashed #374151" : "2px solid white"
  const icon = L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${color};border:${border};box-shadow:0 0 3px rgba(0,0,0,0.5);color:white;font-size:10px;font-weight:700;font-family:system-ui,sans-serif;line-height:1;">${count}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
  iconCache.set(cacheKey, icon)
  return icon
}

const DEFAULT_COLOR = "#1e56a0"
const SELF_COLOR = "#dc2626"
// Neutraler Grauton für Gruppen mit gemischtem Stil (nicht alle Punkte an diesem
// Standort haben dieselbe Farbe/denselben Rand) - dieselbe Farbe, die im Rest der App
// bereits als neutraler Fallback dient (siehe CANDIDATE_STATUS_FALLBACK_COLORS.dot).
const MIXED_GROUP_COLOR = "#9ca3af"

function hasCoords(p: MapPoint): p is ValidMapPoint {
  return typeof p.lat === "number" && typeof p.lng === "number"
}

function effectiveColor(p: MapPoint): string {
  return p.color ?? (p.isSelf ? SELF_COLOR : DEFAULT_COLOR)
}

// Rundet auf 5 Nachkommastellen (~1,1m Genauigkeit am Äquator) - genug, um
// Fließkomma-Ungenauigkeiten abzufangen, aber fein genug, um echte unterschiedliche
// Adressen nicht fälschlich zusammenzulegen.
function groupKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)}|${lng.toFixed(5)}`
}

interface PointGroup {
  key: string
  lat: number
  lng: number
  points: ValidMapPoint[]
}

function groupByLocation(points: ValidMapPoint[]): PointGroup[] {
  const groups = new Map<string, PointGroup>()
  for (const p of points) {
    const key = groupKey(p.lat, p.lng)
    const existing = groups.get(key)
    if (existing) {
      existing.points.push(p)
    } else {
      groups.set(key, { key, lat: p.lat, lng: p.lng, points: [p] })
    }
  }
  return [...groups.values()]
}

// Gemeinsamer Popup-Inhalt für einen einzelnen Punkt - genutzt sowohl für einfache
// Marker (ein Punkt am Standort) als auch pro Zeile in der Liste eines Gruppen-Popups.
function PointDetails({ point }: { point: MapPoint }) {
  return (
    <div>
      {point.href ? (
        <Link href={point.href} className="font-medium hover:underline" style={{ color: "#1e56a0" }}>
          {point.label}
        </Link>
      ) : (
        <span className="font-medium">{point.label}</span>
      )}
      {point.sublabel && <span className="block text-xs text-gray-500">{point.sublabel}</span>}
      {point.note && (
        <span className="mt-1 block text-xs" style={{ color: "#b45309" }}>
          {point.note}
        </span>
      )}
    </div>
  )
}

export function MatchesMap({
  points,
  height = "280px",
  scrollWheelZoom = false,
}: {
  points: MapPoint[]
  height?: string
  scrollWheelZoom?: boolean
}) {
  const validPoints = useMemo(() => points.filter(hasCoords), [points])
  const groups = useMemo(() => groupByLocation(validPoints), [validPoints])

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
        style={{ height, width: "100%" }}
        scrollWheelZoom={scrollWheelZoom}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {groups.map((group) => {
          // Einzelner Punkt an diesem Standort: Verhalten exakt wie vor der Gruppierung.
          if (group.points.length === 1) {
            const p = group.points[0]
            const icon = createDotIcon(effectiveColor(p), p.approximate ?? false)
            return (
              <Marker key={group.key} position={[group.lat, group.lng]} icon={icon}>
                <Popup>
                  <PointDetails point={p} />
                </Popup>
              </Marker>
            )
          }

          // Mehrere Punkte am selben (gerundeten) Standort: gemeinsamer Stil nur, wenn
          // ALLE Punkte in Farbe UND Rand-Art übereinstimmen - sonst neutraler Grauton,
          // damit eine gemischte Gruppe nicht fälschlich wie eine einheitliche aussieht.
          const colors = group.points.map(effectiveColor)
          const dashedFlags = group.points.map((p) => p.approximate ?? false)
          const uniform = colors.every((c) => c === colors[0]) && dashedFlags.every((d) => d === dashedFlags[0])
          const groupColor = uniform ? colors[0] : MIXED_GROUP_COLOR
          const groupDashed = uniform ? dashedFlags[0] : false
          const icon = createGroupIcon(groupColor, groupDashed, group.points.length)

          return (
            <Marker key={group.key} position={[group.lat, group.lng]} icon={icon}>
              <Popup maxHeight={240} minWidth={180}>
                <p className="mb-2 text-sm font-semibold text-gray-900">
                  {group.points.length} Einträge an diesem Standort
                </p>
                <ul className="flex flex-col gap-2">
                  {group.points.map((p, i) => (
                    <li
                      key={i}
                      className={i > 0 ? "border-t pt-2" : undefined}
                      style={i > 0 ? { borderColor: "#dde3ea" } : undefined}
                    >
                      <PointDetails point={p} />
                    </li>
                  ))}
                </ul>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </div>
  )
}
