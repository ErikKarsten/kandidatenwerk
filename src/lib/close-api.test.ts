import { afterEach, describe, expect, it, vi } from "vitest"
import { openCallRecording } from "./close-api"

describe("openCallRecording", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("folgt der Weiterleitung zu S3 ohne Close-Login", async () => {
    process.env.CLOSE_API_KEY = "key"
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://s3.example/rec.mp3?Signature=x" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await openCallRecording("https://api.close.com/call/acti_1/recording/")
    expect((await res.arrayBuffer()).byteLength).toBe(3)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual", headers: { Authorization: expect.stringMatching(/^Basic /) } })
    expect(fetchMock.mock.calls[1]).toEqual(["https://s3.example/rec.mp3?Signature=x"])
  })
})
