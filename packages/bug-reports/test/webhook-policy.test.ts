import { describe, expect, it } from "bun:test"
import {
  assertWebhookOrgIsolation,
  calculateWebhookRetryDelayMs,
  isRetryableWebhookHttpStatus,
  resolveWebhookFailureStatus,
  scheduleWebhookRetryAt,
} from "../src/lib/webhooks/policy"

describe("webhook retry policy", () => {
  it("backs off exponentially and caps the delay at 4 hours", () => {
    expect(calculateWebhookRetryDelayMs(1)).toBe(120_000)
    expect(calculateWebhookRetryDelayMs(2)).toBe(240_000)
    expect(calculateWebhookRetryDelayMs(3)).toBe(480_000)
    expect(calculateWebhookRetryDelayMs(8)).toBe(14_400_000)
    expect(calculateWebhookRetryDelayMs(20)).toBe(14_400_000)
  })

  it("schedules the next attempt from the provided clock", () => {
    const now = new Date("2026-10-06T00:00:00.000Z")
    expect(scheduleWebhookRetryAt({ attempts: 1, now }).toISOString()).toBe(
      "2026-10-06T00:02:00.000Z"
    )
    expect(scheduleWebhookRetryAt({ attempts: 4, now }).toISOString()).toBe(
      "2026-10-06T00:16:00.000Z"
    )
  })

  it("dead-letters after 8 attempts", () => {
    expect(resolveWebhookFailureStatus(1)).toBe("failed")
    expect(resolveWebhookFailureStatus(7)).toBe("failed")
    expect(resolveWebhookFailureStatus(8)).toBe("dead_letter")
  })

  it("retries timeouts, rate limits, and 5xx responses", () => {
    expect(isRetryableWebhookHttpStatus(408)).toBe(true)
    expect(isRetryableWebhookHttpStatus(429)).toBe(true)
    expect(isRetryableWebhookHttpStatus(500)).toBe(true)
    expect(isRetryableWebhookHttpStatus(400)).toBe(false)
    expect(isRetryableWebhookHttpStatus(404)).toBe(false)
    expect(isRetryableWebhookHttpStatus(410)).toBe(false)
  })
})

describe("webhook org isolation", () => {
  it("allows deliveries only when the endpoint and report share an org", () => {
    expect(() =>
      assertWebhookOrgIsolation({
        endpointOrganizationId: "org_a",
        reportOrganizationId: "org_a",
      })
    ).not.toThrow()

    expect(() =>
      assertWebhookOrgIsolation({
        endpointOrganizationId: "org_a",
        reportOrganizationId: "org_b",
      })
    ).toThrow(
      "Webhook endpoint organization does not match the bug report organization."
    )
  })
})
