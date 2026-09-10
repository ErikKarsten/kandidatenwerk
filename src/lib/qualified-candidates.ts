// Kriterien für den automatisch kuratierten "Qualifizierte Kandidaten"-Pool (eigene
// Tabelle qualified_candidates, siehe Migration 20260910000003). Einzige Quelle der
// Aufnahme-Regeln - genutzt von scripts/refresh-qualified-candidates.ts, das diese
// Funktion auf jeden Kandidaten anwendet und die Tabelle entsprechend abgleicht.
//
// Regeln (Stand 10.09.2026, per Steffen freigegeben):
//   1. Status ist weder "neu" (noch kein Qualitäts-Check durchlaufen) noch "abgelehnt".
//   2. Ein Berufsbild ist gesetzt (sonst später schwer einzuordnen).
//   3. Mindestens 4 der 12 festen Zusatzfelder sind ausgefüllt (Profil nicht nur
//      Name/E-Mail) - Schwelle bewusst niedrig gewählt, kann bei Bedarf angepasst werden.
import { FIXED_CUSTOM_FIELD_KEYS } from "./candidate-custom-fields"

const EXCLUDED_STATUS = new Set(["neu", "abgelehnt"])
const MIN_FILLED_FIELDS = 4

export interface QualificationCandidate {
  status: string | null
  berufsbild: string | null
  custom_fields: unknown
}

export interface QualificationResult {
  qualifies: boolean
  reason: string
}

function countFilledFixedFields(customFields: unknown): number {
  if (typeof customFields !== "object" || customFields === null) return 0
  let count = 0
  for (const [key, value] of Object.entries(customFields as Record<string, unknown>)) {
    if (!FIXED_CUSTOM_FIELD_KEYS.has(key)) continue
    if (typeof value === "string" && value.trim() !== "") count++
  }
  return count
}

export function evaluateQualification(candidate: QualificationCandidate): QualificationResult {
  if (!candidate.status || EXCLUDED_STATUS.has(candidate.status)) {
    return { qualifies: false, reason: "Status zu früh oder abgelehnt" }
  }
  if (!candidate.berufsbild) {
    return { qualifies: false, reason: "Kein Berufsbild gesetzt" }
  }
  const filled = countFilledFixedFields(candidate.custom_fields)
  if (filled < MIN_FILLED_FIELDS) {
    return { qualifies: false, reason: `Nur ${filled}/${MIN_FILLED_FIELDS} Zusatzfelder ausgefüllt` }
  }
  return {
    qualifies: true,
    reason: `Status "${candidate.status}", Berufsbild gesetzt, ${filled} Zusatzfelder ausgefüllt`,
  }
}
