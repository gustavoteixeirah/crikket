import { describe, expect, it } from "bun:test"
import {
  TRANSCRIPT_READY_EVENT,
  WEBHOOK_API_VERSION,
} from "../src/lib/webhooks/constants"
import { buildTranscriptReadyEventPayload } from "../src/lib/webhooks/payload"

describe("transcript.ready payload", () => {
  it("builds a versioned summary without full segments", () => {
    const payload = buildTranscriptReadyEventPayload({
      createdAt: new Date("2026-10-06T12:05:00.000Z"),
      deliveryId: "del_456",
      organization: {
        id: "org_123",
        name: "Kode GT",
        slug: "kodegt",
      },
      report: {
        id: "rep_123",
        title: "Checkout freeze",
        url: "https://crikket.kodegt.com/s/rep_123",
      },
      transcript: {
        completedAt: "2026-10-06T12:05:00.000Z",
        durationSeconds: 12.4,
        language: "en",
        model: "gpt-4o-mini-transcribe",
        segmentCount: 2,
        status: "completed",
        text: "The checkout button does nothing.",
      },
    })

    expect(payload.apiVersion).toBe(WEBHOOK_API_VERSION)
    expect(payload.type).toBe(TRANSCRIPT_READY_EVENT)
    expect(payload.data.transcript.segmentCount).toBe(2)
    expect(payload.data.transcript.text).toBe(
      "The checkout button does nothing."
    )
    expect(JSON.stringify(payload)).not.toContain("sk-")
  })
})
