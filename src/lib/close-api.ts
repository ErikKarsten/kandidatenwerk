// Close-API (CLOSE_API_KEY) für die Close-Anbindung (Paket 17 und 30). Basic-Auth mit
// dem API-Schlüssel als Benutzername.

function authHeader(): string | null {
  const key = process.env.CLOSE_API_KEY
  return key ? `Basic ${Buffer.from(`${key}:`).toString("base64")}` : null
}

export function closeConfigured(): boolean {
  return !!process.env.CLOSE_API_KEY
}

export async function closeGet<T>(path: string): Promise<T | null> {
  const auth = authHeader()
  if (!auth) return null
  const res = await fetch(`https://api.close.com/api/v1${path}`, { headers: { Authorization: auth } })
  if (!res.ok) throw new Error(`Close-API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return (await res.json()) as T
}

// Alle Seiten einer Liste (Close: _skip/_limit, has_more), höchstens max Einträge.
export async function closeList<T>(path: string, max = 1000): Promise<T[]> {
  const out: T[] = []
  const sep = path.includes("?") ? "&" : "?"
  for (let skip = 0; skip < max; skip += 100) {
    const page = await closeGet<{ data: T[]; has_more?: boolean }>(`${path}${sep}_limit=100&_skip=${skip}`)
    out.push(...(page?.data ?? []))
    if (!page?.has_more) break
  }
  return out
}

export interface CloseLead {
  id: string
  display_name?: string | null
  url?: string | null
  description?: string | null
  status_label?: string | null
  addresses?: { address_1?: string | null; zipcode?: string | null; city?: string | null }[] | null
  contacts?: { name?: string | null; title?: string | null; emails?: { email: string }[] | null; phones?: { phone: string }[] | null }[] | null
  [key: string]: unknown
}

export interface CloseActivity {
  _type: string
  id: string
  lead_id?: string
  activity_at?: string | null
  date_created?: string | null
  user_name?: string | null
  created_by_name?: string | null
  // Besprechung
  title?: string | null
  starts_at?: string | null
  attendees?: { name?: string | null; email?: string | null }[] | null
  summary?: { text?: string | null } | null
  // Telefonat / Notiz
  note?: string | null
  direction?: string | null
  duration?: number | null
  has_recording?: boolean | null
  recording_url?: string | null
  // Statuswechsel
  old_status_label?: string | null
  new_status_label?: string | null
  // Eigene Aktivität
  custom_activity_type_id?: string | null
  [key: string]: unknown
}

// Namen der eigenen Aktivitätstypen und ihrer Felder (für lesbare Kommentare).
export async function customActivityLabels(): Promise<{ types: Map<string, string>; fields: Map<string, string> }> {
  const [types, fields] = await Promise.all([
    closeList<{ id: string; name: string }>("/custom_activity/"),
    closeList<{ id: string; name: string }>("/custom_field/activity/"),
  ])
  return { types: new Map(types.map((t) => [t.id, t.name])), fields: new Map(fields.map((f) => [f.id, f.name])) }
}

// Namen der Lead-Felder (custom.cf_… -> Bezeichnung).
export async function leadFieldLabels(): Promise<Map<string, string>> {
  const fields = await closeList<{ id: string; name: string }>("/custom_field/lead/")
  return new Map(fields.map((f) => [f.id, f.name]))
}

// Aufnahme eines Telefonats (MP3) als Datenstrom. Close leitet auf eine signierte S3-Adresse weiter. Der
// Weiterleitung selbst folgen: Workers schicken den Authorization-Header sonst mit, und S3
// lehnt zwei Anmeldeverfahren mit 400 ab (live gesehen 07.10.2026).
export async function openCallRecording(recordingUrl: string): Promise<Response> {
  const auth = authHeader()
  if (!auth) throw new Error("CLOSE_API_KEY fehlt.")
  const first = await fetch(recordingUrl, { headers: { Authorization: auth }, redirect: "manual" })
  const location = first.status >= 300 && first.status < 400 ? first.headers.get("location") : null
  const res = location ? await fetch(location) : first
  if (!res.ok) throw new Error(`Aufnahme ${res.status}`)
  return res
}
