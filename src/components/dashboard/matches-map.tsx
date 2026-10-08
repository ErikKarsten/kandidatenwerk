"use client"

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react"
import Link from "next/link"
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet"
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
  // Statt Link: Klick auf den Namen ruft das auf (z.B. Kandidaten-Seitenfenster,
  // Paket 13) - die Seite mit Karte und Suche bleibt erhalten.
  onSelect?: () => void
}

type ValidMapPoint = MapPoint & { lat: number; lng: number }

// Optionale Kreis-Ebene, z.B. Werbegebiete der Meta-Kampagnen (Atlas T-38). Kreise
// beeinflussen den Kartenausschnitt nicht - der richtet sich weiter nach den Punkten.
export interface MapCircle {
  lat: number
  lng: number
  radiusKm: number
  label: string
  sublabel?: string
  color?: string
  // false: nur Anzeige (kein Popup, Klicks gehen an die Karte bzw. Punkte darunter).
  interactive?: boolean
  dashed?: boolean
}

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
      {point.onSelect ? (
        <button type="button" onClick={point.onSelect} className="text-left font-medium hover:underline" style={{ color: "#1e56a0" }}>
          {point.label}
        </button>
      ) : point.href ? (
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

// Imperative API für Aufrufer, die die Kartenposition gezielt steuern wollen (z.B. die
// PLZ/Ort-Suche in dashboard/map/map-overview.tsx) - bewusst nicht über einen weiteren
// Prop gelöst, da eine reine Props-Änderung nicht zwischen "einmalig hinzoomen" und
// "Kandidat für die Bounds-Berechnung" unterscheiden könnte.
// Gesuchter Ort auf der Karte (Paket 28, T-112): Stecknadel plus dezente Entfernungsringe,
// damit man abschätzen kann, wie weit Kandidaten und Kanzleien entfernt sind.
export interface SearchPin {
  lat: number
  lng: number
  label: string
  // Entfernungsringe in km (Standard 10/25/50); [] = ohne Ringe.
  ringsKm?: number[]
}

const SEARCH_PIN_RINGS_KM = [10, 25, 50]

const searchPinIcon = L.divIcon({
  className: "",
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>`,
  iconSize: [30, 40],
  iconAnchor: [15, 39],
  popupAnchor: [0, -36],
})

export interface MatchesMapHandle {
  flyTo(lat: number, lng: number, zoom?: number): void
  // Ausschnitt so wählen, dass ein Umkreis um den Punkt ganz sichtbar ist.
  flyToRadius(lat: number, lng: number, radiusKm: number): void
}

export const MatchesMap = forwardRef<MatchesMapHandle, {
  points: MapPoint[]
  circles?: MapCircle[]
  height?: string
  scrollWheelZoom?: boolean
  // Kartenausschnitt auch nach den Kreisen richten (z.B. Werbegebiete am Kanzleistandort,
  // Paket 13) - sonst zoomt die Karte bei nur einem Punkt ganz nah heran.
  fitCircles?: boolean
  searchPin?: SearchPin | null
  // Klick auf einen Punkt (bzw. eine Punktgruppe), z. B. um einen Umkreis zu zeigen.
  onMarkerClick?: (lat: number, lng: number) => void
}>(function MatchesMap({ points, circles = [], height = "280px", scrollWheelZoom = false, fitCircles = false, searchPin = null, onMarkerClick }, ref) {
  const validPoints = useMemo(() => points.filter(hasCoords), [points])
  const groups = useMemo(() => groupByLocation(validPoints), [validPoints])
  // Referenziell stabil, solange sich die Punktmenge nicht ändert - sonst würde JEDER
  // Re-Render (z.B. durch einen Marker-Klick, der eine Popup öffnet) ein neues
  // L.LatLngBounds-Objekt erzeugen und MapContainers "bounds"-Prop erneut auslösen, was
  // die Karte ungewollt wieder auf alle Punkte zurückzoomt (siehe Bug-Report 25.09.2026).
  // Kreise nur als Abhängigkeit, wenn sie den Ausschnitt bestimmen - sonst würde z. B. ein
  // per Klick gesetzter Umkreis die Karte auf alle Punkte zurückzoomen.
  const fitTo = fitCircles ? circles : null
  const bounds = useMemo(() => {
    const b = L.latLngBounds(validPoints.map((p) => [p.lat, p.lng] as [number, number]))
    for (const c of fitTo ?? []) b.extend(L.latLng(c.lat, c.lng).toBounds(c.radiusKm * 2000))
    return b
  }, [validPoints, fitTo])

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

  useImperativeHandle(ref, () => ({
    flyTo(lat, lng, zoom = 12) {
      map?.flyTo([lat, lng], zoom)
    },
    flyToRadius(lat, lng, radiusKm) {
      map?.flyToBounds(L.latLng(lat, lng).toBounds(radiusKm * 2000), { padding: [30, 30] })
    },
  }), [map])

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
        {circles.map((c, i) => (
          <Circle
            key={`circle-${i}-${c.lat}-${c.lng}-${c.radiusKm}`}
            center={[c.lat, c.lng]}
            radius={c.radiusKm * 1000}
            interactive={c.interactive ?? true}
            pathOptions={{ color: c.color ?? "#f59e0b", weight: 1.5, fillOpacity: 0.08, dashArray: c.dashed ? "6 6" : undefined }}
          >
            {(c.interactive ?? true) && (
              <Popup>
                <p className="text-sm font-semibold text-gray-900">{c.label}</p>
                {c.sublabel && <p className="text-xs text-gray-500">{c.sublabel}</p>}
              </Popup>
            )}
          </Circle>
        ))}
        {searchPin && (
          <>
            {(searchPin.ringsKm ?? SEARCH_PIN_RINGS_KM).map((km) => (
              <Circle
                key={`pin-ring-${km}`}
                center={[searchPin.lat, searchPin.lng]}
                radius={km * 1000}
                interactive={false}
                pathOptions={{ color: "#dc2626", weight: 1, opacity: 0.45, dashArray: "4 6", fill: false }}
              />
            ))}
            <Marker position={[searchPin.lat, searchPin.lng]} icon={searchPinIcon} zIndexOffset={1000}>
              <Popup>
                <p className="text-sm font-semibold text-gray-900">{searchPin.label}</p>
                {(searchPin.ringsKm ?? SEARCH_PIN_RINGS_KM).length > 0 && (
                  <p className="text-xs text-gray-500">Gestrichelte Ringe: {(searchPin.ringsKm ?? SEARCH_PIN_RINGS_KM).join(" / ")} km</p>
                )}
              </Popup>
            </Marker>
          </>
        )}
        {groups.map((group) => {
          // Einzelner Punkt an diesem Standort: Verhalten exakt wie vor der Gruppierung.
          if (group.points.length === 1) {
            const p = group.points[0]
            const icon = createDotIcon(effectiveColor(p), p.approximate ?? false)
            return (
              <Marker key={group.key} position={[group.lat, group.lng]} icon={icon} eventHandlers={onMarkerClick ? { click: () => onMarkerClick(group.lat, group.lng) } : undefined}>
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
            <Marker key={group.key} position={[group.lat, group.lng]} icon={icon} eventHandlers={onMarkerClick ? { click: () => onMarkerClick(group.lat, group.lng) } : undefined}>
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
})
