import { describe, expect, it } from "bun:test"
import {
  createUnavailableTranscriptionSettingsState,
  settingsViewContainsSecret,
  toTranscriptionSettingsPublicView,
} from "../src/lib/transcription/settings-view"

describe("transcription settings public view", () => {
  it("never includes the plaintext or encrypted API key", () => {
    const secret = "sk-live-super-secret-key-9999"
    const view = toTranscriptionSettingsPublicView({
      apiKeyLastFour: "9999",
      enabled: true,
      language: "en",
      model: "gpt-4o-mini-transcribe",
      updatedAt: new Date("2026-10-06T00:00:00.000Z"),
    })

    expect(view.hasApiKey).toBe(true)
    expect(view.maskedApiKey).toBe("••••••••9999")
    expect(view.apiKeyLastFour).toBe("9999")
    expect(JSON.stringify(view)).not.toContain(secret)
    expect(JSON.stringify(view)).not.toContain("sk-live")
    expect(settingsViewContainsSecret(view, secret)).toBe(false)
  })

  it("reports missing encryption env as not configurable", () => {
    const state = createUnavailableTranscriptionSettingsState(
      "ORG_SECRETS_ENCRYPTION_KEY is not configured."
    )
    expect(state.configurable).toBe(false)
    expect(state.settings).toBeNull()
    expect(state.configurationError).toContain("ORG_SECRETS_ENCRYPTION_KEY")
  })
})
