import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Paket 74: Claude bei kie.ai überlastet -> nach drei Fehlversuchen Gemini über kie.ai.
const CLAUDE = "https://api.kie.ai/claude/v1/messages"
const overloaded = () => new Response(JSON.stringify({ type: "error", error: { type: "api_error", message: "Internal error, please try again later" } }), { status: 429 })
const claudeOk = (text: string) => new Response(JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn" }), { status: 200 })
const geminiOk = (text: string) => new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status: 200 })
const geminiUnauthorized = () => new Response(JSON.stringify({ code: 401, msg: "The API key is not authorized to use this model." }), { status: 200 })

describe("KI-Ausweichmodell", () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    vi.stubEnv("KIE_API_KEY", "test")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    ;(await import("@/lib/llm")).resetLlmFallbackForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("antwortet mit Gemini, wenn Claude dreimal überlastet ist", async () => {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url)
      return url === CLAUDE ? overloaded() : geminiOk("Antwort von Gemini")
    }))
    const { generateText } = await import("@/lib/llm")
    const result = generateText({ tier: "smart", prompt: "Hallo" })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe("Antwort von Gemini")
    expect(calls.filter((u) => u === CLAUDE)).toHaveLength(3)
    expect(calls.at(-1)).toContain("gemini-3.1-pro")
  })

  it("macht mit Claude weiter, wenn Gemini nicht freigeschaltet ist", async () => {
    let claudeCalls = 0
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url !== CLAUDE) return geminiUnauthorized()
      claudeCalls++
      return claudeCalls < 4 ? overloaded() : claudeOk("Antwort von Claude")
    }))
    const { generateText } = await import("@/lib/llm")
    const result = generateText({ tier: "smart", prompt: "Hallo" })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe("Antwort von Claude")
    expect(claudeCalls).toBe(4)
  })

  it("fragt Gemini nicht, wenn Claude antwortet", async () => {
    const fetchMock = vi.fn(async () => claudeOk("ok"))
    vi.stubGlobal("fetch", fetchMock)
    const { generateText } = await import("@/lib/llm")
    await expect(generateText({ tier: "fast", prompt: "Hallo" })).resolves.toBe("ok")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
