import plzCoords from "@/data/plz-coords.json"

const COORDS = plzCoords as unknown as Record<string, [number, number]>

export function geocodePlz(plz: string): { lat: number; lng: number } | null {
  const entry = COORDS[plz]
  if (!entry) return null
  const [lat, lng] = entry
  return { lat, lng }
}
