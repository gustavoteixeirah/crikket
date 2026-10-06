import { describe, expect, it } from "bun:test"
import {
  buildWebhookSignedPayload,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../src/lib/webhooks/signature"

describe("webhook signatures", () => {
  const secret = "whsec_test_signing_secret_value"
  const body = JSON.stringify({ type: "report.ready", id: "del_123" })
  const timestamp = "1710000000"

  it("signs timestamp + body with HMAC-SHA256", () => {
    const signature = signWebhookPayload({ body, secret, timestamp })

    expect(signature.startsWith("sha256=")).toBe(true)
    expect(signature.length).toBe("sha256=".length + 64)
    expect(buildWebhookSignedPayload({ body, timestamp })).toBe(
      `${timestamp}.${body}`
    )
  })

  it("verifies a valid signature within the timestamp window", () => {
    const signature = signWebhookPayload({ body, secret, timestamp })

    expect(
      verifyWebhookSignature({
        body,
        nowSeconds: 1_710_000_030,
        secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
      })
    ).toBe(true)
  })

  it("rejects a tampered body, wrong secret, or stale timestamp", () => {
    const signature = signWebhookPayload({ body, secret, timestamp })

    expect(
      verifyWebhookSignature({
        body: `${body} `,
        nowSeconds: 1_710_000_000,
        secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
      })
    ).toBe(false)

    expect(
      verifyWebhookSignature({
        body,
        nowSeconds: 1_710_000_000,
        secret: "whsec_other",
        signatureHeader: signature,
        timestampHeader: timestamp,
      })
    ).toBe(false)

    expect(
      verifyWebhookSignature({
        body,
        nowSeconds: 1_710_000_000 + 6 * 60,
        secret,
        signatureHeader: signature,
        timestampHeader: timestamp,
      })
    ).toBe(false)
  })
})
