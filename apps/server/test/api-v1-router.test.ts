import { describe, expect, it } from "bun:test"
import type { AuthenticatedOrganizationApiKey } from "@crikket/auth/lib/organization-api-keys"
import type {
  AgentNetworkRequestPayload,
  AgentReportAction,
  AgentReportListItem,
  AgentReportLog,
  AgentReportNetworkRequest,
  AgentReportRecord,
  AgentReportStore,
  AgentReportTranscript,
} from "@crikket/bug-reports/lib/agent-reports"
import { handleApiV1Request, matchApiV1Route } from "../src/api-v1/router"

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
    cursorAgentId: null,
    cursorAgentUrl: null,
    debuggerIngestedAt: null,
    debuggerIngestionError: null,
    debuggerIngestionStatus: "completed",
    description: "Broken",
    deviceInfo: { browser: "Firefox" },
    id: "report_a",
    linearIssueId: null,
    linearIssueIdentifier: null,
    linearIssueUrl: null,
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

function createStore(input: {
  actions?: AgentReportAction[]
  logs?: AgentReportLog[]
  network?: AgentReportNetworkRequest[]
  networkPayloads?: AgentNetworkRequestPayload[]
  reports: AgentReportRecord[]
  transcripts?: Record<string, AgentReportTranscript>
}): AgentReportStore & {
  listReportOrgs: string[]
} {
  const actions = input.actions ?? []
  const logs = input.logs ?? []
  const network = input.network ?? []
  const payloads = input.networkPayloads ?? []
  const transcripts = input.transcripts ?? {}
  const listReportOrgs: string[] = []

  const store: AgentReportStore & { listReportOrgs: string[] } = {
    listReportOrgs,
    countActions() {
      return Promise.resolve(actions.length)
    },
    countLogs() {
      return Promise.resolve(logs.length)
    },
    countNetworkRequests() {
      return Promise.resolve(network.length)
    },
    findNetworkRequest(query) {
      const report = input.reports.find(
        (item) =>
          item.id === query.reportId &&
          item.organizationId === query.organizationId
      )
      if (!report) {
        return Promise.resolve(null)
      }

      return Promise.resolve(
        payloads.find((item) => item.id === query.requestId) ?? null
      )
    },
    findReport(query) {
      return Promise.resolve(
        input.reports.find(
          (report) =>
            report.id === query.reportId &&
            report.organizationId === query.organizationId
        ) ?? null
      )
    },
    findTranscript(query) {
      const report = input.reports.find(
        (item) =>
          item.id === query.reportId &&
          item.organizationId === query.organizationId
      )
      if (!report) {
        return Promise.resolve(null)
      }

      return Promise.resolve(transcripts[query.reportId] ?? null)
    },
    getArtifactUrl({ objectKey }) {
      return Promise.resolve(
        objectKey ? `https://signed.example/${objectKey}` : null
      )
    },
    listActions() {
      return Promise.resolve(actions)
    },
    listLogs() {
      return Promise.resolve(logs)
    },
    listNetworkRequests() {
      return Promise.resolve(network)
    },
    listReports(query) {
      listReportOrgs.push(query.organizationId)
      const rows: AgentReportListItem[] = input.reports
        .filter((report) => report.organizationId === query.organizationId)
        .map((report) => {
          const attachmentType =
            report.attachmentType === "video" ||
            report.attachmentType === "screenshot"
              ? report.attachmentType
              : null

          return {
            attachmentType,
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
          }
        })

      return Promise.resolve({ rows, total: rows.length })
    },
  }

  return store
}

function apiRequest(input: {
  authorization?: string
  method?: string
  path: string
}): Request {
  const headers = new Headers()
  if (input.authorization) {
    headers.set("authorization", input.authorization)
  }

  return new Request(`https://crikket.kodegt.com${input.path}`, {
    headers,
    method: input.method ?? "GET",
  })
}

function handle(input: {
  auth?: AuthenticatedOrganizationApiKey | null
  path: string
  rateLimit?: Parameters<typeof handleApiV1Request>[0]["rateLimit"]
  store: AgentReportStore
  authorization?: string
  method?: string
}) {
  return handleApiV1Request({
    authenticate: () =>
      Promise.resolve(input.auth === undefined ? orgAAuth : input.auth),
    rateLimit: input.rateLimit,
    request: apiRequest({
      authorization: input.authorization ?? "Bearer crik_ak_org_a",
      method: input.method,
      path: input.path,
    }),
    store: input.store,
  })
}

describe("organization REST /api/v1", () => {
  it("matches versioned report routes", () => {
    expect(matchApiV1Route("/api/v1/openapi.json")?.name).toBe("openapi")
    expect(matchApiV1Route("/api/v1/reports")?.name).toBe("list_reports")
    expect(matchApiV1Route("/api/v1/reports/report_a")).toEqual({
      name: "get_report",
      reportId: "report_a",
    })
    expect(matchApiV1Route("/api/v1/reports/report_a/events")?.name).toBe(
      "list_events"
    )
    expect(matchApiV1Route("/api/v1/reports/report_a/network/req_1")).toEqual({
      name: "get_network",
      reportId: "report_a",
      requestId: "req_1",
    })
  })

  it("serves OpenAPI without an API key", async () => {
    const response = await handleApiV1Request({
      authenticate: () => Promise.resolve(orgAAuth),
      request: apiRequest({ path: "/api/v1/openapi.json" }),
      store: createStore({ reports: [] }),
    })

    expect(response.status).toBe(200)
    const spec = (await response.json()) as {
      openapi: string
      paths: Record<string, unknown>
    }
    expect(spec.openapi).toBe("3.0.3")
    expect(spec.paths["/api/v1/reports"]).toBeDefined()
    expect(spec.paths["/api/v1/reports/{id}/download"]).toBeDefined()
  })

  it("rejects missing and invalid bearer tokens with 401 before loading reports", async () => {
    const store = createStore({ reports: [createReport()] })
    let finds = 0
    const guarded: AgentReportStore = {
      ...store,
      findReport(query) {
        finds += 1
        return store.findReport(query)
      },
      listReports(query) {
        finds += 1
        return store.listReports(query)
      },
    }

    const missing = await handleApiV1Request({
      authenticate: () => Promise.resolve(orgAAuth),
      request: apiRequest({ path: "/api/v1/reports" }),
      store: guarded,
    })
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({
      error: "unauthorized",
      message:
        "Missing Authorization Bearer token. Create an organization API key in Settings → API Keys.",
    })

    const invalid = await handle({
      auth: null,
      path: "/api/v1/reports",
      store: guarded,
    })
    expect(invalid.status).toBe(401)
    expect(finds).toBe(0)
  })

  it("returns 403 when the key scope cannot read", async () => {
    const response = await handle({
      auth: {
        keyId: "key_a",
        organizationId: "org_a",
        scope: "write" as AuthenticatedOrganizationApiKey["scope"],
      },
      path: "/api/v1/reports",
      store: createStore({ reports: [createReport()] }),
    })

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: "forbidden",
      message: "This API key cannot read reports.",
    })
  })

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

    const response = await handle({
      path: "/api/v1/reports?organizationId=org_b&search=Other",
      store,
    })
    expect(response.status).toBe(200)
    const payload = (await response.json()) as {
      items: Array<{ id: string }>
    }
    expect(store.listReportOrgs).toEqual(["org_a"])
    expect(payload.items.map((item) => item.id)).toEqual(["report_a"])
  })

  it("returns 404 for another organization's report on detail, events, artifacts, network, and download", async () => {
    const store = createStore({
      networkPayloads: [
        {
          id: "req_b",
          method: "GET",
          requestBody: null,
          requestHeaders: null,
          responseBody: null,
          responseHeaders: null,
          status: 200,
          url: "https://example.com",
        },
      ],
      reports: [createReport({ id: "report_b", organizationId: "org_b" })],
    })

    const paths = [
      "/api/v1/reports/report_b",
      "/api/v1/reports/report_b/events?kind=actions",
      "/api/v1/reports/report_b/artifacts",
      "/api/v1/reports/report_b/network/req_b",
      "/api/v1/reports/report_b/download",
      "/api/v1/reports/report_b/context",
    ]

    for (const path of paths) {
      const response = await handle({ path, store })
      expect(response.status).toBe(404)
      const body = (await response.json()) as { error: string }
      expect(body.error).toBe("not_found")
    }
  })

  it("pages events, returns a network payload, and signs artifacts", async () => {
    const store = createStore({
      actions: [
        {
          id: "act_1",
          metadata: null,
          offset: 10,
          target: "#pay",
          timestamp: "2026-10-01T00:00:01.000Z",
          type: "click",
        },
      ],
      network: [
        {
          duration: 12,
          id: "req_1",
          method: "POST",
          offset: 11,
          status: 500,
          timestamp: "2026-10-01T00:00:02.000Z",
          url: "https://api.example.com/pay",
        },
      ],
      networkPayloads: [
        {
          id: "req_1",
          method: "POST",
          requestBody: "{}",
          requestHeaders: { accept: "application/json" },
          responseBody: "fail",
          responseHeaders: null,
          status: 500,
          url: "https://api.example.com/pay",
        },
      ],
      reports: [createReport()],
    })

    const events = await handle({
      path: "/api/v1/reports/report_a/events?kind=actions",
      store,
    })
    expect(events.status).toBe(200)
    const eventPayload = (await events.json()) as {
      items: Array<{ id: string }>
    }
    expect(eventPayload.items.map((item) => item.id)).toEqual(["act_1"])

    const missingKind = await handle({
      path: "/api/v1/reports/report_a/events",
      store,
    })
    expect(missingKind.status).toBe(400)

    const network = await handle({
      path: "/api/v1/reports/report_a/network/req_1",
      store,
    })
    const networkPayload = (await network.json()) as { requestBody: string }
    expect(networkPayload.requestBody).toBe("{}")

    const artifacts = await handle({
      path: "/api/v1/reports/report_a/artifacts",
      store,
    })
    const artifactPayload = (await artifacts.json()) as { videoUrl: string }
    expect(artifactPayload.videoUrl).toBe(
      "https://signed.example/org_a/video.webm"
    )
  })

  it("downloads a JSON export and redirects to signed media", async () => {
    const store = createStore({ reports: [createReport()] })

    const jsonExport = await handle({
      path: "/api/v1/reports/report_a/download",
      store,
    })
    expect(jsonExport.status).toBe(200)
    expect(jsonExport.headers.get("content-disposition")).toContain(
      "crikket-report-report_a.json"
    )
    const exported = (await jsonExport.json()) as {
      id: string
      transcript: null
    }
    expect(exported.id).toBe("report_a")
    expect(exported.transcript).toBeNull()

    const redirect = await handle({
      path: "/api/v1/reports/report_a/download?artifact=video",
      store,
    })
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get("location")).toBe(
      "https://signed.example/org_a/video.webm"
    )
  })

  it("exposes transcript and Linear issue on detail and context", async () => {
    const store = createStore({
      reports: [
        createReport({
          linearIssueId: "lin_1",
          linearIssueIdentifier: "KOD-99",
          linearIssueUrl: "https://linear.app/kodegt/issue/KOD-99",
        }),
      ],
      transcripts: {
        report_a: {
          completedAt: "2026-10-01T00:03:00.000Z",
          durationSeconds: 12,
          error: null,
          language: "en",
          model: "gpt-4o-mini-transcribe",
          segments: [{ end: 12, start: 0, text: "The pay button froze." }],
          startedAt: "2026-10-01T00:02:30.000Z",
          status: "completed",
          text: "The pay button froze.",
        },
      },
    })

    const detail = await handle({
      path: "/api/v1/reports/report_a",
      store,
    })
    expect(detail.status).toBe(200)
    const detailPayload = (await detail.json()) as {
      linear: { identifier: string; url: string }
      transcript: { text: string; status: string }
    }
    expect(detailPayload.transcript.text).toBe("The pay button froze.")
    expect(detailPayload.transcript.status).toBe("completed")
    expect(detailPayload.linear.identifier).toBe("KOD-99")
    expect(detailPayload.linear.url).toBe(
      "https://linear.app/kodegt/issue/KOD-99"
    )

    const context = await handle({
      path: "/api/v1/reports/report_a/context",
      store,
    })
    const contextPayload = (await context.json()) as {
      linear: { identifier: string }
      markdown: string
      transcript: string
      transcriptMeta: { status: string }
    }
    expect(contextPayload.transcript).toBe("The pay button froze.")
    expect(contextPayload.transcriptMeta.status).toBe("completed")
    expect(contextPayload.linear.identifier).toBe("KOD-99")
    expect(contextPayload.markdown).toContain("The pay button froze.")
    expect(contextPayload.markdown).toContain("KOD-99")
  })

  it("applies rate limiting after authentication", async () => {
    const response = await handle({
      path: "/api/v1/reports",
      rateLimit: () =>
        Promise.resolve({
          allowed: false,
          headers: { "retry-after": "30" },
          message: "Too many requests. Please try again soon.",
        }),
      store: createStore({ reports: [createReport()] }),
    })

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("30")
    expect(await response.json()).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again soon.",
    })
  })
})
