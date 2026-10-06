import { describe, expect, it } from "bun:test"
import { prepareAudioForOpenAi } from "../src/lib/transcription/audio"
import { OPENAI_TRANSCRIPTION_MAX_BYTES } from "../src/lib/transcription/constants"

describe("prepareAudioForOpenAi", () => {
  it("passes through files under the 25MB limit", async () => {
    const bytes = Buffer.from("small-webm")
    const result = await prepareAudioForOpenAi({
      bytes,
      contentType: "video/webm",
    })

    expect(result.status).toBe("ready")
    if (result.status === "ready") {
      expect(result.audio.filename).toBe("audio.webm")
      expect(result.audio.bytes.equals(bytes)).toBe(true)
    }
  })

  it("skips oversized media when ffmpeg is unavailable", async () => {
    const bytes = Buffer.alloc(OPENAI_TRANSCRIPTION_MAX_BYTES + 1, 1)
    const result = await prepareAudioForOpenAi({
      bytes,
      contentType: "video/webm",
      ffmpegAvailable: () => Promise.resolve(false),
    })

    expect(result.status).toBe("skipped")
    if (result.status === "skipped") {
      expect(result.error).toContain("ffmpeg is not available")
    }
  })
})
