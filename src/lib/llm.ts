// Gemeinsamer Zugang zu Sprachmodellen (Paket 28, T-98). Anbieter:
// - kie.ai (KIE_API_KEY), bevorzugt: Claude über https://api.kie.ai/claude/v1/messages,
//   Abrechnung über kie.ai-Credits. Die Schnittstelle kennt keinen eigenen "system"-
//   Parameter - die Anweisungen stehen deshalb vor der eigentlichen Nachricht.
// - Anthropic direkt (ANTHROPIC_API_KEY), wenn kein kie.ai-Schlüssel gesetzt ist.
// - Ausweichmodell (Paket 74): Ist Claude bei kie.ai überlastet (429/5xx/"Internal error"),
//   antwortet nach drei Fehlversuchen Gemini über kie.ai - ein anderer Anbieter, fällt
//   meist nicht gleichzeitig aus. Ist Gemini für den Schlüssel nicht freigeschaltet, geht
//   es wie bisher mit Claude weiter.
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
// Für den kie.ai-Schlüssel ist nur Sonnet 5.5 freigegeben (07.10.2026) - auch für "fast".
const KIE_MODELS: Record<LlmTier, string> = { fast: "claude-sonnet-5-5", smart: "claude-sonnet-5-5" }
const ANTHROPIC_MODELS: Record<LlmTier, string> = { fast: "claude-haiku-4-5", smart: "claude-opus-5-5" }
// Gemini 2.5 Pro nimmt kie.ai nicht mehr an ("Invalid model name", 20.10.2026).
export const KIE_FALLBACK_MODEL = "gemini-3.1-pro"
const KIE_FALLBACK_URL = `https://api.kie.ai/${KIE_FALLBACK_MODEL}/v1/chat/completions`
const CLAUDE_ATTEMPTS_BEFORE_FALLBACK = 3
const FALLBACK_PAUSE_MS = 10 * 60_000

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

async function viaKieOnce(key: string, o: GenerateTextOptions): Promise<string> {
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

function isRetryable(err: unknown): boolean {
  return /kie\.ai (429|5\d\d)|internal error/i.test(err instanceof Error ? err.message : String(err))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Gemini über kie.ai (OpenAI-Format): Modell steht in der Adresse, Fehler kommen mit Status
// 200 und {code, msg}.
async function viaKieGeminiOnce(key: string, o: GenerateTextOptions): Promise<string> {
  const messages = [
    ...(o.system ? [{ role: "system", content: [{ type: "text", text: o.system }] }] : []),
    { role: "user", content: [{ type: "text", text: o.prompt }] },
  ]
  const res = await fetch(KIE_FALLBACK_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, stream: false, reasoning_effort: o.tier === "smart" ? "high" : "low" }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 60_000),
  })
  const raw = await res.text()
  let json: { code?: number; msg?: string; choices?: { message?: { content?: string } }[] } | null = null
  try {
    json = JSON.parse(raw)
  } catch {
    // Kein JSON - Fehlermeldung unten mit Rohtext.
  }
  const text = json?.choices?.[0]?.message?.content
  if (!res.ok || (json?.code && json.code !== 200) || typeof text !== "string") {
    throw new Error(`kie.ai ${json?.code ?? res.status}: ${json?.msg || raw.slice(0, 200)} (${KIE_FALLBACK_MODEL})`)
  }
  if (!text.trim()) throw new Error(`Leere Antwort des Modells (${KIE_FALLBACK_MODEL}).`)
  return text.trim()
}

// Ausweichmodell nicht nutzbar (nicht freigeschaltet, unbekannt): eine Weile nicht fragen.
let fallbackPausedUntil = 0

async function viaKieFallback(key: string, o: GenerateTextOptions): Promise<string | null> {
  if (Date.now() < fallbackPausedUntil) return null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await viaKieGeminiOnce(key, o)
      console.warn(`[llm] Claude bei kie.ai überlastet - Antwort von ${KIE_FALLBACK_MODEL}`)
      return text
    } catch (err) {
      if (!isRetryable(err)) {
        fallbackPausedUntil = Date.now() + FALLBACK_PAUSE_MS
        console.warn(`[llm] Ausweichmodell ${KIE_FALLBACK_MODEL} nicht nutzbar: ${err instanceof Error ? err.message : err}`)
        return null
      }
      if (attempt === 0) await sleep(5_000)
    }
  }
  return null
}

// kie.ai drosselt bei vielen gleichzeitigen Anfragen (429, teils "Internal error") - dann
// mit wachsender Pause erneut versuchen (Paket 39, Neuimport mit vielen Kunden); nach drei
// Fehlversuchen zusätzlich das Ausweichmodell fragen (Paket 74).
async function viaKie(key: string, o: GenerateTextOptions): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await viaKieOnce(key, o)
    } catch (err) {
      if (!isRetryable(err) || attempt >= 4) throw err
      if (attempt === CLAUDE_ATTEMPTS_BEFORE_FALLBACK - 1) {
        const text = await viaKieFallback(key, o)
        if (text !== null) return text
      }
      await sleep(5_000 * 2 ** attempt)
    }
  }
}

// Nur für Tests: Pause des Ausweichmodells zurücksetzen.
export function resetLlmFallbackForTests(): void {
  fallbackPausedUntil = 0
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

// Verständliche Meldung für die Oberfläche (Paket 73): Überlastung bei kie.ai statt
// "kie.ai 429: Internal error ...". Andere Fehler bleiben, wie sie sind.
export function friendlyAiError(err: unknown, fallback = "Die KI-Anfrage ist fehlgeschlagen."): string {
  const message = err instanceof Error ? err.message : String(err ?? "")
  if (/kie\.ai (429|5\d\d)|internal error|overloaded|rate limit/i.test(message)) {
    return "Die KI ist gerade überlastet. Bitte in ein paar Minuten noch einmal versuchen."
  }
  if (/timeout|aborted/i.test(message)) return "Die KI hat zu lange gebraucht. Bitte noch einmal versuchen."
  return message || fallback
}
