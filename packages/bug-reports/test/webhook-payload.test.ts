import { describe, expect, it } from "bun:test"
import {
  REPORT_READY_EVENT,
  WEBHOOK_API_VERSION,
} from "../src/lib/webhooks/constants"
import {
  buildReportReadyEventPayload,
  isFailedNetworkRequestStatus,
  stringifyWebhookPayload,
  summarizeDebuggerForWebhook,
} from "../src/lib/webhooks/payload"

describe("report.ready payload", () => {
  it("builds a versioned payload with report, org, media, and debugger summary", () => {
    const payload = buildReportReadyEventPayload({
      createdAt: new Date("2026-10-06T12:00:00.000Z"),
      deliveryId: "del_123",
      media: {
        appUrl: "https://crikket.kodegt.com/s/rep_123",
        contentType: "video/webm",
        expiresAt: "2026-10-06T13:00:00.000Z",
        expiresInSeconds: 3600,
        kind: "video",
        url: "https://minio.example/capture?X-Amz-Signature=abc",
      },
      organization: {
        id: "org_123",
        name: "Kode GT",
        slug: "kodegt",
      },
      report: {
        browser: {
          name: "Chrome 129",
          os: "macOS",
          viewport: "1440x900",
        },
        debugger: summarizeDebuggerForWebhook({
          actionsCount: 12,
          logs: [
            {
              level: "error",
              message: "Uncaught TypeError: x is not a function",
              timestamp: new Date("2026-10-06T11:59:00.000Z"),
            },
            {
              level: "warn",
              message: "Deprecated API",
              timestamp: null,
            },
            {
              level: "info",
              message: "ok",
              timestamp: null,
            },
          ],
          networkRequests: [{ status: 500 }, { status: 200 }, { status: null }],
          topErrorLimit: 5,
        }),
        description: "Checkout button does nothing",
        id: "rep_123",
        pageUrl: "https://app.example.com/checkout",
        reporter: {
          email: "qa@example.com",
          id: "user_1",
          name: "QA Bot",
        },
        title: "Checkout freeze",
        url: "https://crikket.kodegt.com/s/rep_123",
      },
    })

    expect(payload.apiVersion).toBe(WEBHOOK_API_VERSION)
    expect(payload.type).toBe(REPORT_READY_EVENT)
    expect(payload.id).toBe("del_123")
    expect(payload.data.test).toBe(false)
    expect(payload.data.organization.slug).toBe("kodegt")
    expect(payload.data.report.id).toBe("rep_123")
    expect(payload.data.report.url).toBe("https://crikket.kodegt.com/s/rep_123")
    expect(payload.data.report.pageUrl).toBe("https://app.example.com/checkout")
    expect(payload.data.report.reporter?.email).toBe("qa@example.com")
    expect(payload.data.report.media?.expiresInSeconds).toBe(3600)
    expect(payload.data.report.debugger).toEqual({
      actionCount: 12,
      consoleErrorCount: 1,
      consoleWarningCount: 1,
      failedNetworkRequestCount: 2,
      logCount: 3,
      networkRequestCount: 3,
      topErrors: [
        {
          level: "error",
          message: "Uncaught TypeError: x is not a function",
          timestamp: "2026-10-06T11:59:00.000Z",
        },
      ],
    })

    const parsed = JSON.parse(
      stringifyWebhookPayload(payload)
    ) as typeof payload
    expect(parsed.data.report.debugger.actionCount).toBe(12)
  })

  it("treats missing and 4xx+ network statuses as failures", () => {
    expect(isFailedNetworkRequestStatus(null)).toBe(true)
    expect(isFailedNetworkRequestStatus(400)).toBe(true)
    expect(isFailedNetworkRequestStatus(500)).toBe(true)
    expect(isFailedNetworkRequestStatus(200)).toBe(false)
    expect(isFailedNetworkRequestStatus(302)).toBe(false)
  })

  it("caps top errors at N", () => {
    const summary = summarizeDebuggerForWebhook({
      actionsCount: 0,
      logs: [
        { level: "error", message: "one", timestamp: null },
        { level: "error", message: "two", timestamp: null },
        { level: "error", message: "three", timestamp: null },
      ],
      networkRequests: [],
      topErrorLimit: 2,
    })

    expect(summary.consoleErrorCount).toBe(3)
    expect(summary.topErrors.map((error) => error.message)).toEqual([
      "one",
      "two",
    ])
  })
})
