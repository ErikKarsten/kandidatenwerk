import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { leadtableFetch } from "@/lib/leadtable-client"

interface LeadtableLeadsPages {
  totalLeads: number
  totalPages: number
  currentPage: number
  leadsPerPage: number
}
interface LeadtableLead {
  _id: string
  name?: string
  email?: string | null
  phone?: string | null
  status?: string
  [key: string]: unknown
}
interface LeadtableLeadsResponse {
  pages: LeadtableLeadsPages
  leads: LeadtableLead[]
}

const STATUS_MAP: Record<string, string> = {
  Unbearbeitet: "neu",
  Vorqualifiziert: "neu",
  "Nicht erreicht": "neu",
  "2x nicht erreicht + Mail": "neu",
  "In Kontakt": "interview",
}
const FALLBACK_STATUS = "neu"

// Ab wie vielen Wörtern ein Leadtable-"name" als verkettet gilt statt als echter,
// sauberer Name (Leadtable mappt bei manchen Kunden Meta-Anzeigen-/Kampagnennamen
// versehentlich mit auf dasselbe Namensfeld, siehe z.B. "Wolfgang Schnitter BB - A
// Wolfgang Schnitter - BB Wolfgang Schnitter Marc Büttner").
const LONG_NAME_WORD_THRESHOLD = 4

// Begriffe, die typischerweise aus Firmen-/Kampagnennamen stammen, nicht aus echten
// Vornamen — verhindert, dass z.B. "Partner" oder "SFA" fälschlich als Vorname gilt.
const CAMPAIGN_TERM_EXCLUSIONS = new Set([
  "partner",
  "partnerschaft",
  "partg",
  "mbb",
  "gmbh",
  "sfa",
  "sfw",
  "stb",
  "bb",
  "steuerberatung",
  "steuerberater",
  "kanzlei",
  "kollegen",
  "und",
  "co",
  "ag",
])

function looksLikeCampaignTerm(word: string): boolean {
  const normalized = word.toLowerCase().replace(/[.,;:]/g, "")
  return CAMPAIGN_TERM_EXCLUSIONS.has(normalized)
}

// Erkennt Fälle wie "Viktoria Rosengrün Viktoria Rosengrün", bei denen der Name
// versehentlich zweimal hintereinander im Namensfeld gelandet ist (z.B. weil zwei
// Formularfragen auf dasselbe Feld gemappt wurden).
function isFullRepetition(words: string[]): boolean {
  if (words.length < 2 || words.length % 2 !== 0) return false
  const half = words.length / 2
  const firstHalf = words.slice(0, half)
  const secondHalf = words.slice(half)
  return firstHalf.every((word, i) => word.toLowerCase() === secondHalf[i].toLowerCase())
}

export function extractCleanName(rawName: string): {
  firstName: string
  lastName: string
  usedLongNameHeuristic: boolean
} {
  const trimmed = rawName.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)

  if (words.length === 0) {
    return { firstName: "", lastName: "", usedLongNameHeuristic: false }
  }

  if (isFullRepetition(words)) {
    const firstHalf = words.slice(0, words.length / 2)
    return {
      firstName: firstHalf[0],
      lastName: firstHalf.slice(1).join(" "),
      usedLongNameHeuristic: true,
    }
  }

  if (words.length <= LONG_NAME_WORD_THRESHOLD) {
    const spaceIndex = trimmed.indexOf(" ")
    if (spaceIndex === -1) return { firstName: trimmed, lastName: "", usedLongNameHeuristic: false }
    return {
      firstName: trimmed.slice(0, spaceIndex),
      lastName: trimmed.slice(spaceIndex + 1),
      usedLongNameHeuristic: false,
    }
  }

  // Langer Name → vermutlich verkettet. Nimm die letzten 2 Wörter als Vor-/Nachname,
  // außer das drittletzte Wort sieht selbst wie ein Vorname aus (Großbuchstabe, kein
  // erkennbarer Firmen-/Kampagnenbegriff) — dann gehört es vermutlich noch zum Namen dazu.
  const thirdLastWord = words[words.length - 3]
  const thirdLastLooksLikeGivenName = /^[A-ZÄÖÜ]/.test(thirdLastWord) && !looksLikeCampaignTerm(thirdLastWord)

  const nameWords = thirdLastLooksLikeGivenName ? words.slice(-3) : words.slice(-2)
  return {
    firstName: nameWords[0],
    lastName: nameWords.slice(1).join(" "),
    usedLongNameHeuristic: true,
  }
}

async function fetchAllLeads(campaignId: string): Promise<LeadtableLead[]> {
  const firstPage = await leadtableFetch<LeadtableLeadsResponse>(`/lead/campaign/${campaignId}`, {
    page: 1,
    limit: 50,
  })
  const leads = [...firstPage.leads]

  for (let page = 2; page <= firstPage.pages.totalPages; page++) {
    const nextPage = await leadtableFetch<LeadtableLeadsResponse>(`/lead/campaign/${campaignId}`, {
      page,
      limit: 50,
    })
    leads.push(...nextPage.leads)
  }

  return leads
}

export type ImportLeadtableCampaignError = {
  leadId: string
  message: string
}

export type ImportLeadtableCampaignResult = {
  created: number
  skippedAbsage: number
  skippedNoEmail: number
  skippedDuplicate: number
  errors: ImportLeadtableCampaignError[]
}

export async function importLeadtableCampaign(
  customerId: string,
  campaignId: string,
  campaignName: string,
  campaignRecordId?: string
): Promise<ImportLeadtableCampaignResult> {
  void customerId // aktuell ohne Kandidatenwerk-Client-Zuordnung, für spätere Erweiterung vorgesehen

  const kandidatenwerk = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  let clientRecordId: string | null = null
  if (campaignRecordId) {
    const { data: campaignRecord, error: campaignRecordError } = await kandidatenwerk
      .from("campaigns")
      .select("client_id")
      .eq("id", campaignRecordId)
      .single()

    if (campaignRecordError) throw new Error(campaignRecordError.message)
    clientRecordId = campaignRecord.client_id
  }

  const leads = await fetchAllLeads(campaignId)
  const berufsbild = mapKanzleistelleBerufsbild(campaignName)

  const result: ImportLeadtableCampaignResult = {
    created: 0,
    skippedAbsage: 0,
    skippedNoEmail: 0,
    skippedDuplicate: 0,
    errors: [],
  }

  for (const lead of leads) {
    try {
      if (lead.status === "Absage") {
        result.skippedAbsage++
        continue
      }

      if (!lead.email) {
        result.skippedNoEmail++
        continue
      }

      const { data: existing, error: existingError } = await kandidatenwerk
        .from("candidates")
        .select("id")
        .eq("email", lead.email)
        .maybeSingle()

      if (existingError) throw new Error(existingError.message)

      if (existing) {
        result.skippedDuplicate++
        continue
      }

      const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(lead.name ?? "")
      const mappedStatus = STATUS_MAP[lead.status ?? ""] ?? FALLBACK_STATUS

      const notePrefix = usedLongNameHeuristic ? "[Automatisch bereinigter Name, bitte prüfen] " : ""

      const { error: insertError } = await kandidatenwerk.from("candidates").insert({
        first_name: firstName,
        last_name: lastName,
        email: lead.email,
        phone: lead.phone ?? null,
        berufsbild,
        plz: null,
        status: mappedStatus,
        source: "leadtable",
        campaign_id: campaignRecordId ?? null,
        client_id: clientRecordId,
        notes: `${notePrefix}Import aus Leadtable, Kampagne "${campaignName}", ursprünglicher Status: "${lead.status}"`,
      })

      if (insertError) throw new Error(insertError.message)

      result.created++
    } catch (err) {
      result.errors.push({
        leadId: lead._id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
