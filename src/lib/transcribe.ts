// Sprache zu Text über Cloudflare Workers AI (Paket 30, T-127): Whisper large-v3-turbo
// über das AI-Binding in wrangler.jsonc. Die Aufnahme wird als Datenstrom durchgereicht
// (Paket 33) - kein Puffer im Worker-Speicher (128 MB), daher viele Telefonate parallel.
// Getestet 07.10.2026: 6 Aufnahmen gleichzeitig inkl. 38 Minuten in 140 s; ca. 0,05 Cent/Min.
import { getCloudflareContext } from "@opennextjs/cloudflare"

const MODEL = "@cf/openai/whisper-large-v3-turbo"
// Sicherheitsgrenze (ca. 2 Stunden MP3).
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024

interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<{ text?: string }>
}

// audio: Antwort mit der Aufnahme (Datenstrom, z.B. von S3).
export async function transcribeAudio(audio: Response, context?: string): Promise<string> {
  const env = getCloudflareContext().env as unknown as { AI?: AiBinding }
  if (!env.AI) throw new Error("Workers-AI-Binding (AI) fehlt.")
  const size = Number(audio.headers.get("content-length") ?? 0)
  if (size > MAX_AUDIO_BYTES) throw new Error(`Aufnahme zu groß (${Math.round(size / 1e6)} MB).`)
  if (!audio.body) throw new Error("Aufnahme ohne Inhalt.")
  const result = await env.AI.run(MODEL, {
    audio: { body: audio.body, contentType: audio.headers.get("content-type") ?? "audio/mpeg" },
    language: "de",
    vad_filter: true,
    ...(context ? { initial_prompt: context } : {}),
  })
  const text = (result.text ?? "").trim()
  if (!text) throw new Error("Leeres Transkript.")
  return text
}
