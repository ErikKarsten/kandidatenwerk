import { afterEach, describe, expect, it, vi } from "vitest"
import { generateText } from "./llm"

describe("generateText über kie.ai", () => {
  const env = { ...process.env }
  afterEach(() => {
    process.env = { ...env }
    vi.unstubAllGlobals()
  })

  it("schickt Anweisungen in der Nachricht und liest den Text", async () => {
    process.env.KIE_API_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: [{ type: "text", text: " Hallo " }], stop_reason: "end_turn" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(generateText({ tier: "smart", system: "Sei knapp.", prompt: "Frage" })).resolves.toBe("Hallo")
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://api.kie.ai/claude/v1/messages")
    expect(init.headers.Authorization).toBe("Bearer test-key")
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", stream: false })
    expect(body.messages[0].content).toContain("<anweisungen>\nSei knapp.\n</anweisungen>")
    expect(body.messages[0].content).toContain("Frage")
  })

  it("meldet Fehler auch bei Status 200 ohne Inhalt (z.B. fehlende Credits)", async () => {
    process.env.KIE_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 402, msg: "Credits insufficient" }), { status: 200 })))
    await expect(generateText({ tier: "fast", prompt: "x" })).rejects.toThrow("kie.ai 200: Credits insufficient")
  })

  it("ohne Schlüssel ein klarer Fehler", async () => {
    delete process.env.KIE_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(generateText({ tier: "fast", prompt: "x" })).rejects.toThrow("Kein KI-Schlüssel")
  })
})
