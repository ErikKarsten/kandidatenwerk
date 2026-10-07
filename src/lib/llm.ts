// Gemeinsamer Zugang zu Sprachmodellen (Paket 28, T-98). Anbieter:
// - kie.ai (KIE_API_KEY), bevorzugt: Claude über https://api.kie.ai/claude/v1/messages,
//   Abrechnung über kie.ai-Credits. Die Schnittstelle kennt keinen eigenen "system"-
//   Parameter - die Anweisungen stehen deshalb vor der eigentlichen Nachricht.
// - Anthropic direkt (ANTHROPIC_API_KEY), wenn kein kie.ai-Schlüssel gesetzt ist.
// "fast" für einfache Zuordnungen (Formularfelder), "smart" für Texte (Zusammenfassungen,
// Benefits).
import Anthropic from "@anthropic-ai/sdk"

export type LlmTier = "fast" | "smart"

export interface GenerateTextOptions {
  system?: string
  prompt: string
  tier: LlmTier
  maxTokens?: number
  timeoutMs?: number
}

const KIE_URL = "https://api.kie.ai/claude/v1/messages"
const KIE_MODELS: Record<LlmTier, string> = { fast: "claude-haiku-4-5", smart: "claude-sonnet-5-5" }
const ANTHROPIC_MODELS: Record<LlmTier, string> = { fast: "claude-haiku-4-5", smart: "claude-opus-5-5" }

export function llmConfigured(): boolean {
  return !!(process.env.KIE_API_KEY || process.env.ANTHROPIC_API_KEY)
}

interface MessageResponse {
  content?: { type: string; text?: string }[]
  stop_reason?: string
}

function textOf(response: MessageResponse): string {
  if (response.stop_reason === "refusal") throw new Error("Anfrage wurde vom Modell abgelehnt.")
  const text = (response.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim()
  if (!text) throw new Error("Leere Antwort des Modells.")
  return text
}

async function viaKie(key: string, o: GenerateTextOptions): Promise<string> {
  const content = o.system ? `<anweisungen>\n${o.system}\n</anweisungen>\n\n${o.prompt}` : o.prompt
  const res = await fetch(KIE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: KIE_MODELS[o.tier], messages: [{ role: "user", content }], max_tokens: o.maxTokens ?? 2048, stream: false }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  })
  const raw = await res.text()
  let json: (MessageResponse & { msg?: string; message?: string; error?: { message?: string } }) | null = null
  try {
    json = JSON.parse(raw)
  } catch {
    // Kein JSON - Fehlermeldung unten mit Rohtext.
  }
  // kie.ai meldet manche Fehler (z.B. fehlende Credits) mit Status 200 und ohne content.
  if (!res.ok || !json?.content) {
    const reason = json?.error?.message || json?.msg || json?.message || raw.slice(0, 200)
    throw new Error(`kie.ai ${res.status}: ${reason}`)
  }
  return textOf(json)
}

async function viaAnthropic(key: string, o: GenerateTextOptions): Promise<string> {
  const client = new Anthropic({ apiKey: key, timeout: o.timeoutMs ?? 60_000, maxRetries: 1 })
  const response = await client.messages.create({
    model: ANTHROPIC_MODELS[o.tier],
    max_tokens: o.maxTokens ?? 2048,
    ...(o.tier === "smart" ? { output_config: { effort: "low" as const } } : {}),
    ...(o.system ? { system: o.system } : {}),
    messages: [{ role: "user", content: o.prompt }],
  })
  return textOf(response as MessageResponse)
}

// Liefert den Antworttext. Wirft bei fehlendem Schlüssel, API-Fehlern oder Ablehnung.
export async function generateText(o: GenerateTextOptions): Promise<string> {
  const kie = process.env.KIE_API_KEY
  if (kie) return viaKie(kie, o)
  const anthropic = process.env.ANTHROPIC_API_KEY
  if (anthropic) return viaAnthropic(anthropic, o)
  throw new Error("Kein KI-Schlüssel gesetzt (KIE_API_KEY oder ANTHROPIC_API_KEY).")
}
