import { describe, expect, it } from "bun:test"
import {
  AGENT_CONTEXT_ACTION_LIMIT,
  AGENT_CONTEXT_TIMELINE_MAX,
  compareTimelineEvents,
  formatReportContextMarkdown,
  getReportContextForOrganization,
  isHighlightedLogLevel,
  isHighlightedNetworkStatus,
  mergeContextTimeline,
  parsePageTitle,
  parseReportContextFormat,
  trailingWindow,
} from "../src/lib/agent-report-context"
import {
  type AgentNetworkRequestPayload,
  type AgentReportAction,
  type AgentReportListItem,
  type AgentReportLog,
  type AgentReportNetworkRequest,
  AgentReportNotFoundError,
  type AgentReportRecord,
  type AgentReportStore,
} from "../src/lib/agent-reports"

function createReport(
  overrides: Partial<AgentReportRecord> = {}
): AgentReportRecord {
  return {
    attachmentType: "video",
    captureKey: "org_a/video.webm",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    debuggerIngestedAt: new Date("2026-10-01T00:01:00.000Z"),
    debuggerIngestionError: null,
    debuggerIngestionStatus: "completed",
    description: "Pay button does nothing",
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

function action(
  overrides: Partial<AgentReportAction> & Pick<AgentReportAction, "id">
): AgentReportAction {
  return {
    metadata: null,
    offset: 0,
    target: "#pay",
    timestamp: "2026-10-01T00:00:01.000Z",
    type: "click",
    ...overrides,
  }
}

function logEvent(
  overrides: Partial<AgentReportLog> & Pick<AgentReportLog, "id">
): AgentReportLog {
  return {
    level: "info",
    message: "ok",
    messageTruncated: false,
    metadata: null,
    offset: 0,
    timestamp: "2026-10-01T00:00:02.000Z",
    ...overrides,
  }
}

function networkEvent(
  overrides: Partial<AgentReportNetworkRequest> &
    Pick<AgentReportNetworkRequest, "id">
): AgentReportNetworkRequest {
  return {
    duration: 40,
    method: "GET",
    offset: 0,
    status: 200,
    timestamp: "2026-10-01T00:00:03.000Z",
    url: "https://api.example.com/ok",
    ...overrides,
  }
}

function createStore(input: {
  actions?: AgentReportAction[]
  leakedReport?: AgentReportRecord | null
  logs?: AgentReportLog[]
  network?: AgentReportNetworkRequest[]
  reports: AgentReportRecord[]
}): AgentReportStore {
  const actions = input.actions ?? []
  const logs = input.logs ?? []
  const network = input.network ?? []

  return {
    countActions() {
      return Promise.resolve(actions.length)
    },
    countLogs() {
      return Promise.resolve(logs.length)
    },
    countNetworkRequests() {
      return Promise.resolve(network.length)
    },
    findNetworkRequest() {
      const empty: AgentNetworkRequestPayload | null = null
      return Promise.resolve(empty)
    },
    findReport(query) {
      if (input.leakedReport) {
        return Promise.resolve(input.leakedReport)
      }

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
    listActions({ limit, offset }) {
      return Promise.resolve(actions.slice(offset, offset + limit))
    },
    listLogs({ limit, offset }) {
      return Promise.resolve(logs.slice(offset, offset + limit))
    },
    listNetworkRequests({ limit, offset }) {
      return Promise.resolve(network.slice(offset, offset + limit))
    },
    listReports(query) {
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
}

describe("agent report context package", () => {
  it("parses format and page title helpers", () => {
    expect(parseReportContextFormat(undefined)).toBe("json")
    expect(parseReportContextFormat(" Markdown ")).toBe("markdown")
    expect(parseReportContextFormat("html")).toBeNull()
    expect(parsePageTitle({ pageTitle: " Checkout " })).toBe("Checkout")
    expect(parsePageTitle({ pageTitle: "" })).toBeNull()
    expect(isHighlightedLogLevel("ERROR")).toBeTrue()
    expect(isHighlightedLogLevel("warn")).toBeFalse()
    expect(isHighlightedNetworkStatus(500)).toBeTrue()
    expect(isHighlightedNetworkStatus(0)).toBeTrue()
    expect(isHighlightedNetworkStatus(200)).toBeFalse()
    expect(trailingWindow(200, 150)).toEqual({ limit: 150, offset: 50 })
    expect(trailingWindow(5, 150)).toEqual({ limit: 5, offset: 0 })
  })

  it("merges actions, logs, and network in chronological order", () => {
    const timeline = mergeContextTimeline(
      [
        action({
          id: "a2",
          offset: 20,
          timestamp: "2026-10-01T00:00:02.000Z",
          type: "click",
        }),
        action({
          id: "a1",
          offset: 10,
          timestamp: "2026-10-01T00:00:01.000Z",
          type: "keydown",
        }),
      ],
      [
        logEvent({
          id: "l1",
          level: "error",
          message: "boom",
          offset: 15,
          timestamp: "2026-10-01T00:00:01.500Z",
        }),
      ],
      [
        networkEvent({
          id: "n1",
          offset: 25,
          status: 500,
          timestamp: "2026-10-01T00:00:03.000Z",
          url: "https://api.example.com/pay",
        }),
      ]
    )

    expect(timeline.map((event) => event.id)).toEqual(["a1", "l1", "a2", "n1"])
    expect(timeline.find((event) => event.id === "l1")?.highlighted).toBeTrue()
    expect(timeline.find((event) => event.id === "n1")?.highlighted).toBeTrue()
    expect(timeline.find((event) => event.id === "a1")?.highlighted).toBeFalse()
  })

  it("keeps highlighted errors when truncating the merged timeline", () => {
    const actions = Array.from({ length: AGENT_CONTEXT_TIMELINE_MAX }, (_, i) =>
      action({
        id: `a${i}`,
        offset: i,
        timestamp: `2026-10-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      })
    )
    const errorLog = logEvent({
      id: "err",
      level: "error",
      message: "late failure",
      offset: 999,
      timestamp: "2026-10-01T00:01:00.000Z",
    })

    const timeline = mergeContextTimeline(actions, [errorLog], [])
    expect(timeline).toHaveLength(AGENT_CONTEXT_TIMELINE_MAX)
    expect(timeline.some((event) => event.id === "err")).toBeTrue()
  })

  it("does not return another organization's report even when the id is known", async () => {
    const store = createStore({
      reports: [createReport({ id: "report_b", organizationId: "org_b" })],
    })

    await expect(
      getReportContextForOrganization(
        { organizationId: "org_a", reportId: "report_b" },
        store
      )
    ).rejects.toBeInstanceOf(AgentReportNotFoundError)
  })

  it("rejects a leaked row from another org as a second isolation check", async () => {
    const leaked = createReport({
      id: "report_b",
      organizationId: "org_b",
    })
    const store = createStore({
      leakedReport: leaked,
      reports: [leaked],
    })

    await expect(
      getReportContextForOrganization(
        { organizationId: "org_a", reportId: "report_b" },
        store
      )
    ).rejects.toBeInstanceOf(AgentReportNotFoundError)
  })

  it("returns a one-call package with transcript placeholder, media, and omitted counts", async () => {
    const actions = Array.from(
      { length: AGENT_CONTEXT_ACTION_LIMIT + 5 },
      (_, i) =>
        action({
          id: `a${i}`,
          offset: i,
          timestamp: `2026-10-01T00:00:${String(i % 60).padStart(2, "0")}.000Z`,
        })
    )
    const store = createStore({
      actions,
      logs: [
        logEvent({
          id: "l-error",
          level: "error",
          message: "Uncaught TypeError",
          offset: 40,
          timestamp: "2026-10-01T00:00:04.000Z",
        }),
      ],
      network: [
        networkEvent({
          id: "n-fail",
          method: "POST",
          offset: 41,
          status: 500,
          timestamp: "2026-10-01T00:00:05.000Z",
          url: "https://api.example.com/pay",
        }),
      ],
      reports: [createReport()],
    })

    const context = await getReportContextForOrganization(
      { organizationId: "org_a", reportId: "report_a" },
      store
    )

    expect(context.transcript).toBeNull()
    expect(context.pageTitle).toBe("Checkout")
    expect(context.environment?.browser).toBe("Chrome")
    expect(context.reporter?.name).toBe("Ada")
    expect(context.media.videoUrl).toBe(
      "https://signed.example/org_a/video.webm"
    )
    expect(context.media.expiresInSeconds).toBe(15 * 60)
    expect(context.omitted.actions).toBe(5)
    expect(context.timeline.some((event) => event.highlighted)).toBeTrue()
    expect(context.markdown).toContain("# Checkout freeze")
    expect(context.markdown).toContain("**ERROR**")
    expect(context.markdown).toContain("No transcript is available yet.")
    expect(context.markdown).toContain("Omitted 5 actions")
  })

  it("formats paste-ready markdown from a context object", () => {
    const markdown = formatReportContextMarkdown({
      createdAt: "2026-10-01T00:00:00.000Z",
      description: "Broken checkout",
      environment: { browser: "Chrome", os: "macOS", viewport: "1440x900" },
      id: "report_a",
      ingestion: {
        debuggerIngestedAt: null,
        debuggerIngestionError: null,
        debuggerIngestionStatus: "completed",
        submissionStatus: "ready",
      },
      media: {
        attachmentType: "screenshot",
        expiresInSeconds: 900,
        screenshotUrl: "https://signed.example/shot.png",
        thumbnailUrl: null,
        videoUrl: null,
      },
      omitted: { actions: 0, logs: 0, network: 0 },
      organization: { id: "org_a", name: "Org A" },
      pageTitle: "Checkout",
      priority: "high",
      reporter: { name: "Ada" },
      status: "open",
      tags: ["checkout"],
      timeline: [
        {
          highlighted: true,
          id: "l1",
          kind: "log",
          offset: 12,
          summary: "[error] boom",
          timestamp: "2026-10-01T00:00:02.000Z",
        },
      ].sort(compareTimelineEvents),
      title: "Checkout freeze",
      transcript: null,
      updatedAt: "2026-10-01T00:02:00.000Z",
      url: "https://app.example.com/checkout",
      visibility: "private",
    })

    expect(markdown.startsWith("# Checkout freeze")).toBeTrue()
    expect(markdown).toContain("Broken checkout")
    expect(markdown).toContain("**ERROR** log [error] boom")
  })
})
