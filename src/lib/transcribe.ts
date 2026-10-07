// Sprache zu Text über Cloudflare Workers AI (Paket 30, T-127): Whisper large-v3-turbo
// über das AI-Binding in wrangler.jsonc. Getestet 07.10.2026: 38-Minuten-Telefonat (9 MB
// MP3) in ca. 140 s, Kosten ca. 0,05 Cent pro Minute.
import { getCloudflareContext } from "@opennextjs/cloudflare"

const MODEL = "@cf/openai/whisper-large-v3-turbo"
// Sicherheitsgrenze für die Anfragegröße (Base64 ist ca. 4/3 der Datei).
export const MAX_AUDIO_BYTES = 30 * 1024 * 1024

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<{ text?: string }>
}

export async function transcribeAudio(audio: ArrayBuffer, context?: string): Promise<string> {
  const env = getCloudflareContext().env as unknown as { AI?: AiBinding }
  if (!env.AI) throw new Error("Workers-AI-Binding (AI) fehlt.")
  if (audio.byteLength > MAX_AUDIO_BYTES) throw new Error(`Aufnahme zu groß (${Math.round(audio.byteLength / 1e6)} MB).`)
  const result = await env.AI.run(MODEL, {
    audio: Buffer.from(audio).toString("base64"),
    language: "de",
    vad_filter: true,
    ...(context ? { initial_prompt: context } : {}),
  })
  const text = (result.text ?? "").trim()
  if (!text) throw new Error("Leeres Transkript.")
  return text
}
