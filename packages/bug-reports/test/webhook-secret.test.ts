import { describe, expect, it } from "bun:test"
import {
  decryptWebhookSecret,
  deriveWebhookEncryptionKey,
  encryptWebhookSecret,
  generateWebhookSigningSecret,
  maskWebhookSecret,
  webhookSecretLastFour,
} from "../src/lib/webhooks/secret"

describe("webhook signing secrets", () => {
  it("generates a prefixed secret and round-trips encryption", () => {
    const secret = generateWebhookSigningSecret()
    expect(secret.startsWith("whsec_")).toBe(true)

    const encryptionKey = deriveWebhookEncryptionKey(
      "0123456789abcdef0123456789abcdef"
    )
    const encrypted = encryptWebhookSecret({ encryptionKey, secret })
    expect(encrypted.startsWith("v1.")).toBe(true)
    expect(decryptWebhookSecret({ encryptionKey, encrypted })).toBe(secret)
    expect(
      maskWebhookSecret(webhookSecretLastFour(secret)).endsWith(
        secret.slice(-4)
      )
    ).toBe(true)
  })

  it("refuses to decrypt with the wrong key", () => {
    const secret = generateWebhookSigningSecret()
    const encrypted = encryptWebhookSecret({
      encryptionKey: deriveWebhookEncryptionKey(
        "alpha-secret-material-00000000"
      ),
      secret,
    })

    expect(() =>
      decryptWebhookSecret({
        encrypted,
        encryptionKey: deriveWebhookEncryptionKey(
          "beta-secret-material-000000000"
        ),
      })
    ).toThrow()
  })
})
