import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database"
import { mapKanzleistelleBerufsbild } from "@/lib/sync-kanzleistelle"
import { leadtableFetch } from "@/lib/leadtable-client"
import { ensureClientAssignment } from "@/lib/client-assignment"
import { notifyLeadRecipients } from "@/lib/lead-notifications"

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

// Leadtable liefert bei manchen Leads das E-Mail-Feld verdoppelt/verkettet zurück (z.B.
// "erika@example.com erika@example.com", vermutlich ein Formularfeld-Mapping-Problem auf
// Leadtable-Seite, siehe Live-Audit vom 24.09.2026, Fälle Erika Sadzanski/Julia May) -
// hier bereinigen, bevor der Wert für Dublettenprüfung ODER Insert genutzt wird.
function cleanLeadtableEmail(raw: string): string {
  const trimmed = raw.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 2 && parts[0].toLowerCase() === parts[1].toLowerCase()) return parts[0]
  return trimmed
}

// Meta speist Dummy-Test-Leads teils auch in Leadtable ein (gleiche feste Adresse
// "test@meta.com" über viele Kampagnen/Kunden hinweg geteilt, siehe isMetaTestLead in
// meta-ads-client.ts für das Pendant im Meta-Pfad) - hier explizit ausschließen, sonst
// wird EIN geteilter Dummy-Kandidat bei jedem Kunden/jeder Kampagne, die ihren eigenen
// Test-Lead durchlaufen lässt, immer wieder fälschlich umgehängt (siehe Live-Test vom
// 24.09.2026, Kampagne "Braunschweig - SFA").
const KNOWN_TEST_LEAD_EMAILS = new Set(["test@meta.com"])
function isTestLead(lead: LeadtableLead): boolean {
  return KNOWN_TEST_LEAD_EMAILS.has((lead.email ?? "").trim().toLowerCase())
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
  skippedTestLead: number
  skippedDuplicate: number
  // Von den Duplikaten (bereits bekannter Kandidat per E-Mail): wie viele wurden dabei
  // mit dieser (neuen/anderen) Kampagne verknüpft und/oder im Status aktualisiert -
  // Pendant zum "erneut beworben"-Fall im Meta-Pfad (siehe processMetaLead), vorher
  // wurde hier still übersprungen, siehe Root-Cause-Audit vom 24.09.2026.
  relinkedExisting: number
  errors: ImportLeadtableCampaignError[]
  // IDs der neu angelegten Kandidaten (Kandidatenwerk-IDs) - z.B. damit der Aufrufer
  // gezielt matchCandidateToCampaigns() pro neuem Kandidaten anstoßen kann, statt
  // pauschal für alle Kandidaten der Kampagne.
  createdCandidateIds: string[]
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
    skippedTestLead: 0,
    skippedDuplicate: 0,
    relinkedExisting: 0,
    errors: [],
    createdCandidateIds: [],
  }

  for (const lead of leads) {
    try {
      if (lead.status === "Absage") {
        result.skippedAbsage++
        continue
      }

      if (isTestLead(lead)) {
        result.skippedTestLead++
        continue
      }

      if (!lead.email) {
        result.skippedNoEmail++
        continue
      }

      const email = cleanLeadtableEmail(lead.email)
      const mappedStatus = STATUS_MAP[lead.status ?? ""] ?? FALLBACK_STATUS

      // Gegen die bereinigte UND die (evtl. noch nicht migrierte) verdoppelte Form
      // prüfen, damit ein bereits bekannter Kandidat mit historisch verdoppelt
      // gespeicherter E-Mail hier trotzdem gefunden wird, statt fälschlich als neu zu gelten.
      const { data: matches, error: existingError } = await kandidatenwerk
        .from("candidates")
        .select("id, campaign_id, client_id, status, email, leadtable_lead_id")
        .in("email", Array.from(new Set([email, `${email} ${email}`])))

      if (existingError) throw new Error(existingError.message)

      // Kommt dieselbe E-Mail bei mehreren Kandidaten vor (z.B. Altbestand mit
      // eigenständigen Dubletten durch den E-Mail-Verdopplungs-Bug, siehe Live-Test vom
      // 24.09.2026, Fall Erika Sadzanski), NIE raten: nur eindeutig übernehmen, wenn
      // genau einer davon bereits zu DIESEM Kunden gehört - sonst überspringen und zur
      // manuellen Prüfung protokollieren, statt versehentlich den falschen Kandidaten
      // umzuhängen.
      let existing: NonNullable<typeof matches>[number] | null = null
      if (matches && matches.length === 1) {
        existing = matches[0]
      } else if (matches && matches.length > 1) {
        const clientMatch = clientRecordId ? matches.find((m) => m.client_id === clientRecordId) : undefined
        if (clientMatch) {
          existing = clientMatch
        } else {
          result.errors.push({
            leadId: lead._id,
            message:
              `Mehrdeutig: ${matches.length} Kandidaten mit E-Mail "${email}" gefunden, keiner eindeutig ` +
              `diesem Kunden zuordenbar (IDs: ${matches.map((m) => m.id).join(", ")}) - übersprungen, bitte manuell prüfen.`,
          })
          continue
        }
      }

      if (existing) {
        result.skippedDuplicate++

        // Bekannter Kandidat, hier per E-Mail gefunden - wie im Meta-Pfad
        // (processMetaLead) nicht mehr nur überspringen: Status/leadtable_lead_id/
        // E-Mail-Bereinigung immer nachziehen, Kampagnen-/Kunden-Zuordnung nur
        // ergänzen, wenn sie sich tatsächlich geändert hat (Root-Cause-Fix,
        // Audit vom 24.09.2026 - Fall Erika Sadzanski/Julia May, Brausnchweig - SFA).
        const candidateUpdates: {
          status?: string
          email?: string
          leadtable_lead_id?: string
          campaign_id?: string
        } = {}
        if (existing.status !== mappedStatus) candidateUpdates.status = mappedStatus
        if (existing.email !== email) candidateUpdates.email = email
        if (existing.leadtable_lead_id !== lead._id) candidateUpdates.leadtable_lead_id = lead._id
        const campaignChanged = !!campaignRecordId && existing.campaign_id !== campaignRecordId
        if (campaignChanged) candidateUpdates.campaign_id = campaignRecordId

        if (Object.keys(candidateUpdates).length > 0) {
          const { error: updateError } = await kandidatenwerk
            .from("candidates")
            .update(candidateUpdates)
            .eq("id", existing.id)
          if (updateError) throw new Error(updateError.message)
          result.relinkedExisting++
        }

        let newAssignment = false
        if (clientRecordId) {
          const { data: existingAssignment } = await kandidatenwerk
            .from("client_assignments")
            .select("id")
            .eq("candidate_id", existing.id)
            .eq("client_id", clientRecordId)
            .is("removed_at", null)
            .maybeSingle()

          if (!existingAssignment) {
            await ensureClientAssignment(kandidatenwerk, existing.id, clientRecordId)
            newAssignment = true
          }
        }

        if (campaignChanged || newAssignment) {
          await kandidatenwerk.from("candidate_history").insert({
            candidate_id: existing.id,
            type: "note",
            content:
              `Erneut über Leadtable beworben, Kampagne "${campaignName}"` +
              (newAssignment ? " - neue Kanzlei-Zuordnung ergänzt" : " - Zuordnung aktualisiert") +
              `, Status: "${lead.status}".`,
          })
        }

        continue
      }

      const { firstName, lastName, usedLongNameHeuristic } = extractCleanName(lead.name ?? "")

      const notePrefix = usedLongNameHeuristic ? "[Automatisch bereinigter Name, bitte prüfen] " : ""

      const { data: insertedCandidate, error: insertError } = await kandidatenwerk
        .from("candidates")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email,
          phone: lead.phone ?? null,
          berufsbild,
          plz: null,
          status: mappedStatus,
          source: "leadtable",
          campaign_id: campaignRecordId ?? null,
          client_id: clientRecordId,
          leadtable_lead_id: lead._id,
          notes: `${notePrefix}Import aus Leadtable, Kampagne "${campaignName}", ursprünglicher Status: "${lead.status}"`,
        })
        .select("id")
        .single()

      if (insertError) throw new Error(insertError.message)

      if (clientRecordId) {
        try {
          await ensureClientAssignment(kandidatenwerk, insertedCandidate.id, clientRecordId)
        } catch (assignmentError) {
          console.error(`Kunden-Zuordnung fehlgeschlagen für Kandidat ${insertedCandidate.id}:`, assignmentError)
        }
      }

      try {
        await notifyLeadRecipients(insertedCandidate.id, `${firstName} ${lastName}`.trim())
      } catch (notifyError) {
        console.error(`Lead-Benachrichtigung fehlgeschlagen für Kandidat ${insertedCandidate.id}:`, notifyError)
      }

      result.created++
      result.createdCandidateIds.push(insertedCandidate.id)
    } catch (err) {
      result.errors.push({
        leadId: lead._id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
