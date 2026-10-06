import { describe, expect, it } from "bun:test"
import {
  assertWebhookDestinationAllowed,
  isPrivateOrLoopbackIp,
  parseWebhookDestinationUrl,
  WebhookUrlBlockedError,
} from "../src/lib/webhooks/ssrf"

describe("webhook SSRF guards", () => {
  it("classifies loopback, private, and link-local addresses as blocked", () => {
    expect(isPrivateOrLoopbackIp("127.0.0.1")).toBe(true)
    expect(isPrivateOrLoopbackIp("10.0.0.4")).toBe(true)
    expect(isPrivateOrLoopbackIp("192.168.1.20")).toBe(true)
    expect(isPrivateOrLoopbackIp("169.254.169.254")).toBe(true)
    expect(isPrivateOrLoopbackIp("172.16.0.1")).toBe(true)
    expect(isPrivateOrLoopbackIp("::1")).toBe(true)
    expect(isPrivateOrLoopbackIp("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false)
    expect(isPrivateOrLoopbackIp("1.1.1.1")).toBe(false)
  })

  it("rejects credentials, non-http schemes, and localhost hostnames", async () => {
    expect(() => parseWebhookDestinationUrl("not-a-url")).toThrow(
      WebhookUrlBlockedError
    )
    expect(() =>
      parseWebhookDestinationUrl("https://user:pass@example.com/hook")
    ).toThrow(WebhookUrlBlockedError)
    expect(() => parseWebhookDestinationUrl("ftp://example.com/hook")).toThrow(
      WebhookUrlBlockedError
    )

    await expect(
      assertWebhookDestinationAllowed("http://example.com/hook")
    ).rejects.toBeInstanceOf(WebhookUrlBlockedError)

    await expect(
      assertWebhookDestinationAllowed("https://localhost/hook")
    ).rejects.toBeInstanceOf(WebhookUrlBlockedError)

    await expect(
      assertWebhookDestinationAllowed("https://n8n.internal/hook")
    ).rejects.toBeInstanceOf(WebhookUrlBlockedError)
  })

  it("blocks public hostnames that resolve to private IPs", async () => {
    await expect(
      assertWebhookDestinationAllowed("https://evil.example/hook", {
        lookupFn: async () => [{ address: "10.0.0.8", family: 4 }],
      })
    ).rejects.toBeInstanceOf(WebhookUrlBlockedError)
  })

  it("allows private targets only when the opt-in flag is set", async () => {
    const parsed = await assertWebhookDestinationAllowed(
      "http://n8n.internal/webhook",
      { allowPrivate: true }
    )
    expect(parsed.hostname).toBe("n8n.internal")
  })

  it("allows a public HTTPS hostname whose DNS is public", async () => {
    const parsed = await assertWebhookDestinationAllowed(
      "https://hooks.n8n.cloud/webhook/abc",
      {
        lookupFn: async () => [{ address: "1.1.1.1", family: 4 }],
      }
    )
    expect(parsed.protocol).toBe("https:")
  })
})
