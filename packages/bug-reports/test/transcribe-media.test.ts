import { describe, expect, it } from "bun:test"
import { randomBytes } from "node:crypto"
import { encryptOrgSecret } from "../src/lib/org-secrets"
import { createOpenAiRequestError } from "../src/lib/transcription/openai"
import { transcribeReportMedia } from "../src/lib/transcription/transcribe-media"

const encryptionKey = randomBytes(32)
const apiKey = "sk-test-org-a-key"
const encrypted = encryptOrgSecret({ encryptionKey, secret: apiKey })

describe("transcribeReportMedia", () => {
  it("completes a happy path with a mocked OpenAI client", async () => {
    const result = await transcribeReportMedia(
      {
        apiKeyEncrypted: encrypted,
        attachmentType: "video",
        captureBytes: Buffer.from("webm-bytes"),
        captureContentType: "video/webm",
        encryptionKeyMaterial: encryptionKey.toString("base64"),
        language: "en",
        model: "whisper-1",
        reportOrganizationId: "org_a",
        settingsOrganizationId: "org_a",
      },
      {
        decryptApiKey: ({ encrypted: value, encryptionKey: key }) => {
          expect(value).toBe(encrypted)
          expect(key.equals(encryptionKey)).toBe(true)
          return apiKey
        },
        transcribe: (input) => {
          expect(input.apiKey).toBe(apiKey)
          expect(input.model).toBe("whisper-1")
          expect(input.language).toBe("en")
          return Promise.resolve({
            durationSeconds: 2,
            language: "en",
            segments: [{ end: 2, start: 0, text: "Hello" }],
            text: "Hello",
          })
        },
      }
    )

    expect(result).toEqual({
      durationSeconds: 2,
      language: "en",
      model: "whisper-1",
      segments: [{ end: 2, start: 0, text: "Hello" }],
      status: "completed",
      text: "Hello",
    })
  })

  it("skips when ORG_SECRETS_ENCRYPTION_KEY is missing", async () => {
    const result = await transcribeReportMedia(
      {
        apiKeyEncrypted: encrypted,
        attachmentType: "video",
        captureBytes: Buffer.from("webm-bytes"),
        captureContentType: "video/webm",
        encryptionKeyMaterial: undefined,
        language: null,
        model: "gpt-4o-mini-transcribe",
        reportOrganizationId: "org_a",
        settingsOrganizationId: "org_a",
      },
      {
        decryptApiKey: () => apiKey,
        transcribe: () => {
          throw new Error("must not call OpenAI")
        },
      }
    )

    expect(result.status).toBe("skipped")
    if (result.status === "skipped") {
      expect(result.error).toContain("ORG_SECRETS_ENCRYPTION_KEY")
    }
  })

  it("marks retryable OpenAI failures and refuses cross-org settings", async () => {
    const failed = await transcribeReportMedia(
      {
        apiKeyEncrypted: encrypted,
        attachmentType: "video",
        captureBytes: Buffer.from("webm-bytes"),
        captureContentType: "video/webm",
        encryptionKeyMaterial: encryptionKey.toString("base64"),
        language: null,
        model: "gpt-4o-mini-transcribe",
        reportOrganizationId: "org_a",
        settingsOrganizationId: "org_a",
      },
      {
        decryptApiKey: () => apiKey,
        transcribe: () => {
          throw createOpenAiRequestError({
            message: "OpenAI transcription failed with HTTP 429",
            retryable: true,
            status: 429,
          })
        },
      }
    )

    expect(failed).toEqual({
      error: "OpenAI transcription failed with HTTP 429",
      retryable: true,
      status: "failed",
    })

    await expect(
      transcribeReportMedia(
        {
          apiKeyEncrypted: encrypted,
          attachmentType: "video",
          captureBytes: Buffer.from("webm-bytes"),
          captureContentType: "video/webm",
          encryptionKeyMaterial: encryptionKey.toString("base64"),
          language: null,
          model: "gpt-4o-mini-transcribe",
          reportOrganizationId: "org_a",
          settingsOrganizationId: "org_b",
        },
        {
          decryptApiKey: () => apiKey,
          transcribe: () => {
            throw new Error("must not call OpenAI")
          },
        }
      )
    ).rejects.toThrow("does not match")
  })
})
