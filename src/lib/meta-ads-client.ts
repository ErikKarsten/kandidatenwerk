// Dünner Wrapper um die Meta Graph API, analog zu leadtable-client.ts. Nutzt den
// System-User-/Page-Access-Token aus META_ACCESS_TOKEN. Version per Env überschreibbar
// (META_GRAPH_API_VERSION), Default v25.0 (Stand 09/2026) - Meta veröffentlicht neue
// Versionen ca. alle 3-4 Monate, alte Versionen laufen nach ca. 2 Jahren ab.
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v25.0"
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`

export async function metaGraphFetch<T>(
  path: string,
  params?: Record<string, string | number>,
  accessTokenOverride?: string
): Promise<T> {
  const url = new URL(`${GRAPH_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value))
  }
  // Seitengebundene Endpunkte (leadgen_forms, leads) verlangen zwingend den
  // Page-Access-Token DIESER Seite statt des allgemeinen System-User-Tokens, sonst
  // Fehler #190 "This method must be called with a Page Access Token" - daher hier
  // überschreibbar, siehe fetchMetaLeadForms/fetchMetaLeadsForForm.
  url.searchParams.set("access_token", accessTokenOverride ?? process.env.META_ACCESS_TOKEN!)

  const response = await fetch(url)

  if (!response.ok) {
    // Access Token nie in Fehlermeldungen/Logs landen lassen - Query-String der Antwort
    // enthält ihn nicht (Meta gibt ihn nicht zurück), aber sicherheitshalber wird hier
    // nur response.text() (Fehlerbody von Meta) geloggt, nie die volle url.
    throw new Error(`Meta-Graph-API-Fehler (${response.status}) bei ${path}: ${await response.text()}`)
  }

  return response.json()
}

export interface MetaPage {
  id: string
  name: string
  // Eigener Page-Access-Token dieser Seite - nötig für leadgen_forms/leads-Aufrufe
  // auf dieser Seite (siehe metaGraphFetch-Kommentar). NIE an den Browser
  // durchreichen (siehe listMetaPagesAction in campaigns/[id]/actions.ts).
  access_token?: string
}

export interface MetaLeadForm {
  id: string
  name: string
  status?: string
}

export interface MetaLeadFieldData {
  name: string
  values: string[]
}

export interface MetaLead {
  id: string
  created_time: string
  field_data: MetaLeadFieldData[]
}

interface MetaPaging {
  cursors?: { after?: string; before?: string }
  next?: string
}

// Seiten, auf die der im Access Token hinterlegte User/System-User Zugriff hat (Business
// Manager -> "Seiten" bzw. für einen System-User die ihm zugewiesenen Assets).
export async function fetchMetaPages(): Promise<MetaPage[]> {
  const resp = await metaGraphFetch<{ data: MetaPage[]; paging?: MetaPaging }>("/me/accounts", {
    fields: "id,name,access_token",
    limit: 100,
  })
  return resp.data
}

// Lead-Formulare einer Seite (nur die Basisdaten - Fragen/Feldnamen liest die KI-
// Extraktion aus den tatsächlichen Leads mit, siehe meta-leads-sync.ts, statt hier
// zusätzlich das Formular-Schema abzufragen).
export async function fetchMetaLeadForms(pageId: string, pageAccessToken?: string): Promise<MetaLeadForm[]> {
  const resp = await metaGraphFetch<{ data: MetaLeadForm[]; paging?: MetaPaging }>(
    `/${pageId}/leadgen_forms`,
    { fields: "id,name,status", limit: 100 },
    pageAccessToken
  )
  return resp.data
}

// Alle Leads eines Formulars, mit Pagination (per `after`-Cursor, wie leadtableFetch es
// für Leadtable-Seiten macht) und optionalem `since` (Unix-Timestamp), um bei
// wiederholten Sync-Läufen nicht jedes Mal die komplette Formularhistorie neu zu holen.
export async function fetchMetaLeadsForForm(
  formId: string,
  options?: { sinceUnix?: number },
  pageAccessToken?: string
): Promise<MetaLead[]> {
  const leads: MetaLead[] = []
  let after: string | undefined

  do {
    const params: Record<string, string | number> = {
      fields: "id,created_time,field_data",
      limit: 100,
    }
    if (options?.sinceUnix) params.since = options.sinceUnix
    if (after) params.after = after

    const resp = await metaGraphFetch<{ data: MetaLead[]; paging?: MetaPaging }>(
      `/${formId}/leads`,
      params,
      pageAccessToken
    )
    leads.push(...resp.data)
    after = resp.paging?.cursors?.after && resp.paging?.next ? resp.paging.cursors.after : undefined
  } while (after)

  return leads
}

// Baut einmalig eine Formular-ID -> Seiten-Token-Zuordnung über ALLE dem Systemnutzer
// zugewiesenen Seiten auf. Kampagnen speichern aktuell nur die Formular-ID (nicht die
// Seiten-ID), daher lässt sich der passende Page-Access-Token nicht direkt ableiten -
// wird u.a. vom Sync-Skript einmal pro Lauf genutzt (siehe scripts/meta-leads-sync.ts),
// statt bei jeder Kampagne einzeln zu raten oder zu scheitern.
export async function buildFormToPageAccessTokenMap(): Promise<Map<string, string>> {
  const pages = await fetchMetaPages()
  const map = new Map<string, string>()

  for (const page of pages) {
    if (!page.access_token) continue
    try {
      const forms = await fetchMetaLeadForms(page.id, page.access_token)
      for (const form of forms) {
        map.set(form.id, page.access_token)
      }
    } catch (err) {
      console.warn(
        `  [Warnung] Formulare der Seite "${page.name}" konnten nicht geladen werden: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  return map
}

// Wandelt Metas field_data-Array (Frage-Key + Antwort-Werte) in eine flache
// Record<string, string> um - nutzt jeweils den ersten Wert (Meta-Formularfragen sind
// praktisch immer single-value; Mehrfachauswahl kommt bei Lead Ads nicht vor). Wird
// sowohl für die KI-Zusatzfelder-Extraktion (als modifiedData-Ersatz, siehe
// leadtable-sync-shared.ts) als auch zum Herauslesen von Name/E-Mail/Telefon genutzt.
export function metaFieldDataToRecord(fieldData: MetaLeadFieldData[]): Record<string, string> {
  const record: Record<string, string> = {}
  for (const field of fieldData) {
    const value = field.values?.[0]
    if (typeof value === "string" && value.trim() !== "") {
      record[field.name] = value.trim()
    }
  }
  return record
}

// Meta liefert Name/E-Mail/Telefon als eigene, standardisierte Feld-Keys (bei allen
// Lead-Ads-Formularen gleich benannt, unabhängig von Sprache/individuellen Fragen).
const NAME_KEYS = ["full_name"]
const EMAIL_KEYS = ["email"]
const PHONE_KEYS = ["phone_number"]

function firstMatchingValue(record: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    if (record[key]) return record[key]
  }
  return null
}

export function extractMetaContactFields(fieldData: MetaLeadFieldData[]): {
  name: string | null
  email: string | null
  phone: string | null
  record: Record<string, string>
} {
  const record = metaFieldDataToRecord(fieldData)
  return {
    name: firstMatchingValue(record, NAME_KEYS),
    email: firstMatchingValue(record, EMAIL_KEYS),
    phone: firstMatchingValue(record, PHONE_KEYS),
    record,
  }
}
