import { describe, expect, it } from "bun:test"
import {
  assertTranscriptionOrgIsolation,
  calculateTranscriptionRetryDelayMs,
  isRetryableOpenAiHttpStatus,
  resolveTranscriptionFailureStatus,
} from "../src/lib/transcription/policy"

describe("transcription retry policy", () => {
  it("backs off and dead-letters after five attempts", () => {
    expect(calculateTranscriptionRetryDelayMs(1)).toBe(60_000)
    expect(calculateTranscriptionRetryDelayMs(2)).toBe(120_000)
    expect(resolveTranscriptionFailureStatus(4)).toBe("failed")
    expect(resolveTranscriptionFailureStatus(5)).toBe("dead_letter")
    expect(isRetryableOpenAiHttpStatus(429)).toBe(true)
    expect(isRetryableOpenAiHttpStatus(500)).toBe(true)
    expect(isRetryableOpenAiHttpStatus(401)).toBe(false)
  })

  it("enforces org isolation", () => {
    expect(() =>
      assertTranscriptionOrgIsolation({
        reportOrganizationId: "org_a",
        settingsOrganizationId: "org_b",
      })
    ).toThrow("does not match")

    expect(() =>
      assertTranscriptionOrgIsolation({
        reportOrganizationId: "org_a",
        settingsOrganizationId: "org_a",
      })
    ).not.toThrow()
  })
})
