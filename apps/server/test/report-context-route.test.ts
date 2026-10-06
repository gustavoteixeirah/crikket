import { describe, expect, it } from "bun:test"
import type { AuthenticatedOrganizationApiKey } from "@crikket/auth/lib/organization-api-keys"
import type {
  AgentReportAction,
  AgentReportLog,
  AgentReportNetworkRequest,
  AgentReportRecord,
  AgentReportStore,
} from "@crikket/bug-reports/lib/agent-reports"
import { handleReportContextRequest } from "../src/api-v1/report-context-route"

const orgAAuth: AuthenticatedOrganizationApiKey = {
  keyId: "key_a",
  organizationId: "org_a",
  scope: "read",
}

function createReport(
  overrides: Partial<AgentReportRecord> = {}
): AgentReportRecord {
  return {
    attachmentType: "video",
    captureKey: "org_a/video.webm",
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    debuggerIngestedAt: null,
    debuggerIngestionError: null,
    debuggerIngestionStatus: "completed",
    description: "Broken",
    deviceInfo: { browser: "Firefox" },
    id: "report_a",
    metadata: { pageTitle: "Home" },
    organizationId: "org_a",
    organizationName: "Org A",
    priority: "medium",
    reporterName: "Ada",
    status: "open",
    submissionStatus: "ready",
    tags: [],
    thumbnailKey: null,
    title: "Home crash",
    updatedAt: new Date("2026-10-01T00:02:00.000Z"),
    url: "https://app.example.com/",
    visibility: "private",
    ...overrides,
  }
}

function createStore(reports: AgentReportRecord[]): AgentReportStore {
  const emptyActions: AgentReportAction[] = []
  const emptyLogs: AgentReportLog[] = []
  const emptyNetwork: AgentReportNetworkRequest[] = []

  return {
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
      return Promise.resolve(null)
    },
    findTranscript() {
      return Promise.resolve(null)
    },
    findReport(query) {
      return Promise.resolve(
        reports.find(
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
      return Promise.resolve(emptyActions)
    },
    listLogs() {
      return Promise.resolve(emptyLogs)
    },
    listNetworkRequests() {
      return Promise.resolve(emptyNetwork)
    },
    listReports() {
      return Promise.resolve({ rows: [], total: 0 })
    },
  }
}

function contextRequest(input: {
  authorization?: string
  format?: string
  method?: string
  reportId?: string
}): Request {
  const reportId = input.reportId ?? "report_a"
  const search = input.format ? `?format=${input.format}` : ""
  const headers = new Headers()
  if (input.authorization) {
    headers.set("authorization", input.authorization)
  }

  return new Request(
    `https://crikket.kodegt.com/api/v1/reports/${reportId}/context${search}`,
    {
      headers,
      method: input.method ?? "GET",
    }
  )
}

describe("GET /api/v1/reports/:id/context", () => {
  it("rejects missing and invalid bearer tokens before loading a report", async () => {
    const store = createStore([createReport()])
    let finds = 0
    const guardedStore: AgentReportStore = {
      ...store,
      findReport(query) {
        finds += 1
        return store.findReport(query)
      },
    }

    const missing = await handleReportContextRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      reportId: "report_a",
      request: contextRequest({}),
      store: guardedStore,
    })
    expect(missing.status).toBe(401)
    expect(finds).toBe(0)

    const invalid = await handleReportContextRequest({
      authenticate: () => Promise.resolve(null),
      reportId: "report_a",
      request: contextRequest({ authorization: "Bearer crik_ak_invalid" }),
      store: guardedStore,
    })
    expect(invalid.status).toBe(401)
    expect(finds).toBe(0)
  })

  it("returns 404 for another organization's report id", async () => {
    const store = createStore([
      createReport({ id: "report_b", organizationId: "org_b" }),
    ])

    const response = await handleReportContextRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      reportId: "report_b",
      request: contextRequest({
        authorization: "Bearer crik_ak_org_a",
        reportId: "report_b",
      }),
      store,
    })

    expect(response.status).toBe(404)
  })

  it("returns 400 for an unknown format", async () => {
    const response = await handleReportContextRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      format: "html",
      reportId: "report_a",
      request: contextRequest({
        authorization: "Bearer crik_ak_org_a",
        format: "html",
      }),
      store: createStore([createReport()]),
    })

    expect(response.status).toBe(400)
  })

  it("returns json by default and markdown when requested", async () => {
    const store = createStore([createReport()])

    const jsonResponse = await handleReportContextRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      reportId: "report_a",
      request: contextRequest({ authorization: "Bearer crik_ak_org_a" }),
      store,
    })
    expect(jsonResponse.status).toBe(200)
    expect(jsonResponse.headers.get("content-type")).toBe("application/json")
    const payload = (await jsonResponse.json()) as {
      id: string
      markdown: string
      transcript: string | null
    }
    expect(payload.id).toBe("report_a")
    expect(payload.transcript).toBeNull()
    expect(payload.markdown).toContain("# Home crash")

    const markdownResponse = await handleReportContextRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      format: "markdown",
      reportId: "report_a",
      request: contextRequest({
        authorization: "Bearer crik_ak_org_a",
        format: "markdown",
      }),
      store,
    })
    expect(markdownResponse.status).toBe(200)
    expect(markdownResponse.headers.get("content-type")).toBe(
      "text/markdown; charset=utf-8"
    )
    const markdown = await markdownResponse.text()
    expect(markdown.startsWith("# Home crash")).toBeTrue()
  })
})
