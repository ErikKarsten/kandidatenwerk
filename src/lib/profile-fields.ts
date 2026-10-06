// Einstellbare Felder für Kanzleiprofil und Stellenprofil (Paket 18, T-80). Eingebaute
// Felder (eigene Spalten) lassen sich in Bezeichnung, Hinweis, Pflicht und Sichtbarkeit
// überschreiben; eigene Zusatzfelder speichern ihre Werte in `extra`. Ohne Einstellungen
// gelten die eingebauten Standards. Client-tauglich (kein Server-Code).
import { PROFILE_FIELDS } from "@/lib/client-project"
import { STELLE_BUILTIN_FIELDS } from "@/lib/position-profile"

export type FieldScope = "kanzlei" | "stelle"

export interface ProfileFieldSetting {
  scope: FieldScope
  key: string
  label: string
  hint: string | null
  required: boolean
  active: boolean
  multiline: boolean
  is_custom: boolean
  field_group: string | null
  sort_order: number
}

export interface ResolvedField {
  key: string
  label: string
  hint: string | null
  required: boolean
  active: boolean
  multiline: boolean
  custom: boolean
  // Abschnitt im Kanzleiprofil (kanzlei / angebot / intern); im Stellenprofil leer.
  group: string | null
  defaultLabel: string
}

export interface PositionSnippet {
  id: string
  berufsbild: string
  kind: "aufgaben" | "anforderungen"
  text: string
  sort_order: number
}

interface Builtin {
  key: string
  label: string
  hint?: string
  required?: boolean
  multiline?: boolean
  group?: string
}

function builtinsFor(scope: FieldScope): Builtin[] {
  return scope === "stelle"
    ? STELLE_BUILTIN_FIELDS
    : PROFILE_FIELDS.map((f) => ({ key: f.key, label: f.label, hint: f.placeholder, required: f.required, multiline: f.multiline, group: f.group }))
}

// Alle Felder eines Bereichs inkl. ausgeblendeter (für die Einstellungen).
export function resolveAllFields(scope: FieldScope, settings: ProfileFieldSetting[]): ResolvedField[] {
  const own = settings.filter((s) => s.scope === scope)
  const builtin = builtinsFor(scope).map((b): ResolvedField => {
    const o = own.find((s) => s.key === b.key && !s.is_custom)
    return {
      key: b.key,
      label: o?.label?.trim() || b.label,
      hint: o ? o.hint : (b.hint ?? null),
      required: o ? o.required : !!b.required,
      active: o ? o.active : true,
      multiline: !!b.multiline,
      custom: false,
      group: b.group ?? null,
      defaultLabel: b.label,
    }
  })
  const custom = own
    .filter((s) => s.is_custom)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label))
    .map(
      (s): ResolvedField => ({
        key: s.key,
        label: s.label,
        hint: s.hint,
        required: s.required,
        active: s.active,
        multiline: s.multiline,
        custom: true,
        group: scope === "kanzlei" ? s.field_group || "kanzlei" : null,
        defaultLabel: s.label,
      })
    )
  return [...builtin, ...custom]
}

// Nur sichtbare Felder (für Formulare und Pflichtprüfung).
export function resolveFields(scope: FieldScope, settings: ProfileFieldSetting[]): ResolvedField[] {
  return resolveAllFields(scope, settings).filter((f) => f.active)
}

type WithExtra = { extra?: Record<string, unknown> | null } & Record<string, unknown>

// Wert eines Felds: eingebaute aus der Spalte, eigene aus `extra`.
export function fieldValue(record: object | null | undefined, field: Pick<ResolvedField, "key" | "custom">): string {
  if (!record) return ""
  const r = record as WithExtra
  const raw = field.custom ? r.extra?.[field.key] : r[field.key]
  return typeof raw === "string" ? raw : ""
}

// Schlüssel für ein neues eigenes Feld aus der Bezeichnung.
export function customFieldKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40)
  return `eigen_${slug || "feld"}`
}

export function snippetsFor(snippets: PositionSnippet[], berufsbild: string | null | undefined): { aufgaben: string[]; anforderungen: string[] } {
  const list = snippets.filter((s) => s.berufsbild === (berufsbild || "sonstige")).sort((a, b) => a.sort_order - b.sort_order)
  return {
    aufgaben: list.filter((s) => s.kind === "aufgaben").map((s) => s.text),
    anforderungen: list.filter((s) => s.kind === "anforderungen").map((s) => s.text),
  }
}
