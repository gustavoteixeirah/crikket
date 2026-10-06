import { describe, expect, it } from "bun:test"
import {
  buildTranscriptionFormData,
  parseOpenAiTranscriptionResponse,
} from "../src/lib/transcription/openai"

describe("OpenAI transcription helpers", () => {
  it("requests verbose_json segments for whisper-1 only", () => {
    const whisper = buildTranscriptionFormData({
      file: new Blob(["audio"]),
      filename: "audio.webm",
      language: "en",
      model: "whisper-1",
    })
    expect(whisper.get("response_format")).toBe("verbose_json")
    expect(whisper.get("model")).toBe("whisper-1")
    expect(whisper.get("language")).toBe("en")

    const mini = buildTranscriptionFormData({
      file: new Blob(["audio"]),
      filename: "audio.webm",
      model: "gpt-4o-mini-transcribe",
    })
    expect(mini.get("response_format")).toBe("json")
    expect(mini.get("language")).toBeNull()
  })

  it("parses text and optional segments", () => {
    const parsed = parseOpenAiTranscriptionResponse({
      duration: 3.5,
      language: "en",
      segments: [
        { end: 1.2, start: 0, text: " Hello " },
        { end: 3.5, start: 1.2, text: "world" },
      ],
      text: "Hello world",
    })

    expect(parsed.text).toBe("Hello world")
    expect(parsed.language).toBe("en")
    expect(parsed.durationSeconds).toBe(3.5)
    expect(parsed.segments).toEqual([
      { end: 1.2, start: 0, text: "Hello" },
      { end: 3.5, start: 1.2, text: "world" },
    ])
  })
})
