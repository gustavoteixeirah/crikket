import { describe, expect, it } from "bun:test"
import {
  AGENT_LOG_MESSAGE_PREVIEW_CHARS,
  type AgentNetworkRequestPayload,
  type AgentReportAction,
  type AgentReportListItem,
  type AgentReportLog,
  type AgentReportNetworkRequest,
  AgentReportNotFoundError,
  type AgentReportRecord,
  type AgentReportStore,
  belongsToOrganization,
  getReportArtifactsForOrganization,
  getReportForOrganization,
  listReportsForOrganization,
  truncateLogMessage,
} from "../src/lib/agent-reports"

function createReport(
  overrides: Partial<AgentReportRecord>
): AgentReportRecord {
  return {
    attachmentType: "video",
    captureKey: "org_a/video.webm",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    debuggerIngestedAt: new Date("2026-10-01T00:01:00.000Z"),
    debuggerIngestionError: null,
    debuggerIngestionStatus: "completed",
    description: "Button does nothing",
    deviceInfo: { browser: "Chrome", os: "macOS", viewport: "1440x900" },
    id: "report_a",
    metadata: { pageTitle: "Checkout" },
    organizationId: "org_a",
    organizationName: "Org A",
    priority: "high",
    reporterName: "Ada",
    status: "open",
    submissionStatus: "ready",
    tags: ["checkout"],
    thumbnailKey: "org_a/thumbnail.png",
    title: "Checkout freeze",
    updatedAt: new Date("2026-10-01T00:02:00.000Z"),
    url: "https://app.example.com/checkout",
    visibility: "private",
    ...overrides,
  }
}

function createStore(input: {
  reports: AgentReportRecord[]
}): AgentReportStore & {
  findReportCalls: Array<{ organizationId: string; reportId: string }>
  listReportCalls: Array<{ organizationId: string }>
} {
  const findReportCalls: Array<{ organizationId: string; reportId: string }> =
    []
  const listReportCalls: Array<{ organizationId: string }> = []

  const emptyAction: AgentReportAction[] = []
  const emptyLogs: AgentReportLog[] = []
  const emptyNetwork: AgentReportNetworkRequest[] = []
  const emptyPayload: AgentNetworkRequestPayload | null = null

  const store: AgentReportStore & {
    findReportCalls: Array<{ organizationId: string; reportId: string }>
    listReportCalls: Array<{ organizationId: string }>
  } = {
    findReportCalls,
    listReportCalls,
    countActions() {
      return Promise.resolve(0)
    },
    countLogs() {
      return Promise.resolve(0)
    },
    countNetworkRequests() {
      return Promise.resolve(0)
    },
    findNetworkRequest() {
      return Promise.resolve(emptyPayload)
    },
    findTranscript() {
      return Promise.resolve(null)
    },
    findReport(query) {
      findReportCalls.push(query)
      return Promise.resolve(
        input.reports.find(
          (report) =>
            report.id === query.reportId &&
            report.organizationId === query.organizationId
        ) ?? null
      )
    },
    getArtifactUrl({ objectKey }) {
      return Promise.resolve(
        objectKey ? `https://signed.example/${objectKey}` : null
      )
    },
    listActions() {
      return Promise.resolve(emptyAction)
    },
    listLogs() {
      return Promise.resolve(emptyLogs)
    },
    listNetworkRequests() {
      return Promise.resolve(emptyNetwork)
    },
    listReports(query) {
      listReportCalls.push({ organizationId: query.organizationId })
      const rows: AgentReportListItem[] = input.reports
        .filter((report) => report.organizationId === query.organizationId)
        .map((report) => ({
          attachmentType:
            report.attachmentType === "video" ||
            report.attachmentType === "screenshot"
              ? report.attachmentType
              : null,
          createdAt: report.createdAt.toISOString(),
          debuggerIngestionStatus: report.debuggerIngestionStatus,
          description: report.description,
          hasCapture: Boolean(report.captureKey),
          id: report.id,
          priority: report.priority,
          reporterName: report.reporterName,
          status: report.status,
          submissionStatus: report.submissionStatus,
          title: report.title ?? "Untitled Bug Report",
          updatedAt: report.updatedAt.toISOString(),
          url: report.url,
        }))

      return Promise.resolve({ rows, total: rows.length })
    },
  }

  return store
}

describe("agent report org isolation", () => {
  it("lists only reports for the authenticated organization", async () => {
    const store = createStore({
      reports: [
        createReport({ id: "report_a", organizationId: "org_a" }),
        createReport({
          id: "report_b",
          organizationId: "org_b",
          title: "Other org",
        }),
      ],
    })

    const result = await listReportsForOrganization(
      { organizationId: "org_a" },
      store
    )

    expect(store.listReportCalls).toEqual([{ organizationId: "org_a" }])
    expect(result.items.map((item) => item.id)).toEqual(["report_a"])
  })

  it("does not return another organization's report even when the id is known", async () => {
    const store = createStore({
      reports: [createReport({ id: "report_b", organizationId: "org_b" })],
    })

    await expect(
      getReportForOrganization(
        { organizationId: "org_a", reportId: "report_b" },
        store
      )
    ).rejects.toBeInstanceOf(AgentReportNotFoundError)

    expect(store.findReportCalls).toEqual([
      { organizationId: "org_a", reportId: "report_b" },
    ])
  })

  it("rejects a leaked row from another org as a second isolation check", () => {
    const leaked = createReport({
      id: "report_b",
      organizationId: "org_b",
    })

    expect(belongsToOrganization(leaked, "org_a")).toBeFalse()
    expect(belongsToOrganization(leaked, "org_b")).toBeTrue()
  })

  it("issues artifact URLs only after the org-scoped lookup", async () => {
    const store = createStore({
      reports: [createReport({ id: "report_a", organizationId: "org_a" })],
    })

    const artifacts = await getReportArtifactsForOrganization(
      { organizationId: "org_a", reportId: "report_a" },
      store
    )

    expect(artifacts.videoUrl).toBe("https://signed.example/org_a/video.webm")
    expect(artifacts.expiresInSeconds).toBe(15 * 60)

    await expect(
      getReportArtifactsForOrganization(
        { organizationId: "org_b", reportId: "report_a" },
        store
      )
    ).rejects.toBeInstanceOf(AgentReportNotFoundError)
  })

  it("truncates oversized console log previews", () => {
    const longMessage = "x".repeat(AGENT_LOG_MESSAGE_PREVIEW_CHARS + 20)
    const truncated = truncateLogMessage(longMessage)
    expect(truncated.messageTruncated).toBeTrue()
    expect(truncated.message).toHaveLength(AGENT_LOG_MESSAGE_PREVIEW_CHARS)
  })
})
