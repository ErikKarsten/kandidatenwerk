#!/usr/bin/env node
/**
 * Generates src/types/database.ts from the PostgREST OpenAPI spec.
 * No PAT required — uses only the project URL and service key.
 *
 * Usage:
 *   SUPABASE_SECRET_KEY=sb_secret_... node scripts/gen-types.mjs
 *   node scripts/gen-types.mjs   (reads from .env.local automatically)
 */
import { readFileSync, writeFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

// --- load .env.local ---
function loadEnv() {
  try {
    for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
      const [k, ...rest] = line.split("=")
      if (k && rest.length && !process.env[k.trim()]) {
        process.env[k.trim()] = rest.join("=").trim()
      }
    }
  } catch {}
}
loadEnv()

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
const API_KEY = process.env.SUPABASE_SECRET_KEY

if (!URL_BASE || !API_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY")
  process.exit(1)
}

// --- fetch spec ---
console.log(`Fetching schema from ${URL_BASE}/rest/v1/ ...`)
const res = await fetch(`${URL_BASE}/rest/v1/`, {
  headers: { Authorization: `Bearer ${API_KEY}`, apikey: API_KEY },
})
if (!res.ok) {
  console.error(`HTTP ${res.status}: ${await res.text()}`)
  process.exit(1)
}
const spec = await res.json()
const defs = spec.definitions ?? {}

// --- helpers ---
function pgFormatToTs(colDef) {
  const fmt = colDef.format ?? ""
  if (fmt === "uuid") return "string"
  if (fmt === "text" || fmt === "character varying" || fmt === "name") return "string"
  if (fmt === "boolean") return "boolean"
  if (["integer", "bigint", "smallint", "real", "double precision", "numeric"].includes(fmt)) return "number"
  if (["timestamp with time zone", "timestamp without time zone", "date", "time without time zone"].includes(fmt)) return "string"
  if (fmt === "json" || fmt === "jsonb") return "Json"
  if (colDef.type === "array") {
    const itemFmt = colDef.items?.format ?? colDef.items?.type ?? "string"
    const itemTs = itemFmt === "integer" ? "number" : "string"
    return `${itemTs}[]`
  }
  return "unknown"
}

function nullable(tableDef, colName, colDef) {
  const required = tableDef.required ?? []
  if (required.includes(colName)) return false   // NOT NULL, no default
  if ("default" in colDef) return false           // NOT NULL, has default
  return true
}

function parseRelationships(tableName, tableDef) {
  const rels = []
  for (const [col, def] of Object.entries(tableDef.properties ?? {})) {
    const m = (def.description ?? "").match(/<fk table='(\w+)' column='(\w+)'/)
    if (m) {
      rels.push({
        foreignKeyName: `${tableName}_${col}_fkey`,
        columns: [col],
        referencedRelation: m[1],
        referencedColumns: [m[2]],
      })
    }
  }
  return rels
}

// --- code-gen ---
function col(colDef, tableDef, colName, optional) {
  const ts = pgFormatToTs(colDef)
  const null_ = nullable(tableDef, colName, colDef)
  const type = null_ ? `${ts} | null` : ts
  const q = optional ? "?" : ""
  return `${colName}${q}: ${type}`
}

function tableBlock(name, def) {
  const props = Object.entries(def.properties ?? {})
  const req = def.required ?? []

  const rowCols = props.map(([n, d]) => `          ${col(d, def, n, false)}`).join("\n")

  const insertCols = props
    .map(([n, d]) => {
      const isRequired = req.includes(n) && !("default" in d)
      return `          ${col(d, def, n, !isRequired)}`
    })
    .join("\n")

  const updateCols = props.map(([n, d]) => `          ${col(d, def, n, true)}`).join("\n")

  const rels = parseRelationships(name, def)
  const relsStr =
    rels.length === 0
      ? "[]"
      : `[\n${rels
          .map(
            (r) =>
              `          {\n            foreignKeyName: "${r.foreignKeyName}"\n            columns: ${JSON.stringify(r.columns)}\n            isOneToOne: false\n            referencedRelation: "${r.referencedRelation}"\n            referencedColumns: ${JSON.stringify(r.referencedColumns)}\n          }`
          )
          .join(",\n")}\n        ]`

  return `      ${name}: {
        Row: {
${rowCols}
        }
        Insert: {
${insertCols}
        }
        Update: {
${updateCols}
        }
        Relationships: ${relsStr}
      }`
}

const tableBlocks = Object.entries(defs)
  .map(([name, def]) => tableBlock(name, def))
  .join("\n")

const output = `// Generated from PostgREST OpenAPI spec — do not edit manually.
// Regenerate: node scripts/gen-types.mjs

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
${tableBlocks}
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"]

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"]
`

const outPath = resolve(ROOT, "src/types/database.ts")
writeFileSync(outPath, output, "utf8")
console.log(`Written ${outPath}`)
console.log(`Tables: ${Object.keys(defs).join(", ")}`)
