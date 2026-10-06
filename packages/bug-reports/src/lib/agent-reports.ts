import {
  buildPaginationMeta,
  type PaginationMeta,
} from "@crikket/shared/lib/server/pagination"
import type {
  ReportTranscriptSummary,
  ReportTranscriptView,
} from "./transcription/types"

export const AGENT_REPORT_DEFAULT_PAGE_SIZE = 20
export const AGENT_REPORT_MAX_PAGE_SIZE = 50
export const AGENT_EVENT_DEFAULT_PAGE_SIZE = 50
export const AGENT_EVENT_MAX_PAGE_SIZE = 200
export const AGENT_GET_REPORT_ACTIONS_LIMIT = 50
export const AGENT_GET_REPORT_LOGS_LIMIT = 50
export const AGENT_GET_REPORT_NETWORK_LIMIT = 25
export const AGENT_LOG_MESSAGE_PREVIEW_CHARS = 500
export const AGENT_ARTIFACT_URL_TTL_SECONDS = 15 * 60

export type AgentReportStatus = "open" | "in_progress" | "resolved" | "closed"
export type AgentReportEventKind = "actions" | "logs" | "network"

export type AgentReportListItem = {
  attachmentType: "video" | "screenshot" | null
  createdAt: string
  debuggerIngestionStatus: string
  description: string | null
  hasCapture: boolean
  id: string
  priority: string
  reporterName: string | null
  status: string
  submissionStatus: string
  title: string
  updatedAt: string
  url: string | null
}

export type AgentReportDeviceInfo = {
  browser?: string
  os?: string
  viewport?: string
}

export type AgentReportAction = {
  id: string
  metadata: Record<string, unknown> | null
  offset: number | null
  target: string | null
  timestamp: string
  type: string
}

export type AgentReportLog = {
  id: string
  level: string
  message: string
  messageTruncated: boolean
  metadata: Record<string, unknown> | null
  offset: number | null
  timestamp: string
}

export type AgentReportNetworkRequest = {
  duration: number | null
  id: string
  method: string
  offset: number | null
  status: number | null
  timestamp: string
  url: string
}

export type AgentPaginatedEvents<TItem> = {
  items: TItem[]
  pagination: PaginationMeta
}

export type AgentReportTranscript = ReportTranscriptView
export type AgentReportTranscriptSummary = ReportTranscriptSummary

export type AgentReportDetail = {
  actions: AgentPaginatedEvents<AgentReportAction>
  createdAt: string
  description: string | null
  deviceInfo: AgentReportDeviceInfo | null
  id: string
  ingestion: {
    debuggerIngestedAt: string | null
    debuggerIngestionError: string | null
    debuggerIngestionStatus: string
    submissionStatus: string
  }
  logs: AgentPaginatedEvents<AgentReportLog>
  metadata: Record<string, unknown> | null
  networkRequests: AgentPaginatedEvents<AgentReportNetworkRequest>
  organization: {
    id: string
    name: string
  }
  priority: string
  reporter: {
    name: string | null
  } | null
  status: string
  tags: string[]
  title: string
  transcript: AgentReportTranscriptSummary | null
  updatedAt: string
  url: string | null
  visibility: string
}

export type AgentReportArtifacts = {
  attachmentType: "video" | "screenshot" | null
  expiresInSeconds: number
  screenshotUrl: string | null
  thumbnailUrl: string | null
  videoUrl: string | null
}

export type AgentNetworkRequestPayload = {
  id: string
  method: string
  requestBody: string | null
  requestHeaders: Record<string, string> | null
  responseBody: string | null
  responseHeaders: Record<string, string> | null
  status: number | null
  url: string
}

export type AgentReportListQuery = {
  createdAfter?: Date
  createdBefore?: Date
  organizationId: string
  page: number
  perPage: number
  search?: string
  status?: AgentReportStatus
}

export type AgentReportStore = {
  countActions: (input: {
    organizationId: string
    reportId: string
  }) => Promise<number>
  countLogs: (input: {
    organizationId: string
    reportId: string
  }) => Promise<number>
  countNetworkRequests: (input: {
    organizationId: string
    reportId: string
    search?: string
  }) => Promise<number>
  findNetworkRequest: (input: {
    organizationId: string
    reportId: string
    requestId: string
  }) => Promise<AgentNetworkRequestPayload | null>
  findReport: (input: {
    organizationId: string
    reportId: string
  }) => Promise<AgentReportRecord | null>
  findTranscript: (input: {
    organizationId: string
    reportId: string
  }) => Promise<AgentReportTranscript | null>
  getArtifactUrl: (input: {
    expiresInSeconds: number
    objectKey: string | null
  }) => Promise<string | null>
  listActions: (input: {
    limit: number
    offset: number
    organizationId: string
    reportId: string
  }) => Promise<AgentReportAction[]>
  listLogs: (input: {
    limit: number
    offset: number
    organizationId: string
    reportId: string
  }) => Promise<AgentReportLog[]>
  listNetworkRequests: (input: {
    limit: number
    offset: number
    organizationId: string
    reportId: string
    search?: string
  }) => Promise<AgentReportNetworkRequest[]>
  listReports: (
    query: AgentReportListQuery
  ) => Promise<{ rows: AgentReportListItem[]; total: number }>
}

export type AgentReportRecord = {
  attachmentType: string | null
  captureKey: string | null
  createdAt: Date
  debuggerIngestedAt: Date | null
  debuggerIngestionError: string | null
  debuggerIngestionStatus: string
  description: string | null
  deviceInfo: unknown
  id: string
  metadata: unknown
  organizationId: string
  organizationName: string
  priority: string
  reporterName: string | null
  status: string
  submissionStatus: string
  tags: string[] | null
  thumbnailKey: string | null
  title: string | null
  updatedAt: Date
  url: string | null
  visibility: string
}

export class AgentReportNotFoundError extends Error {
  constructor(message = "Bug report not found") {
    super(message)
    this.name = "AgentReportNotFoundError"
  }
}

export function normalizeAgentListPagination(input: {
  page?: number
  perPage?: number
}): { limit: number; offset: number; page: number; perPage: number } {
  return normalizePagination(
    input.page,
    input.perPage,
    AGENT_REPORT_DEFAULT_PAGE_SIZE,
    AGENT_REPORT_MAX_PAGE_SIZE
  )
}

export function normalizeAgentEventPagination(input: {
  page?: number
  perPage?: number
}): { limit: number; offset: number; page: number; perPage: number } {
  return normalizePagination(
    input.page,
    input.perPage,
    AGENT_EVENT_DEFAULT_PAGE_SIZE,
    AGENT_EVENT_MAX_PAGE_SIZE
  )
}

function normalizePagination(
  rawPage: number | undefined,
  rawPerPage: number | undefined,
  defaultPageSize: number,
  maxPageSize: number
): { limit: number; offset: number; page: number; perPage: number } {
  const page =
    typeof rawPage === "number" && Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1
  const perPage =
    typeof rawPerPage === "number" && Number.isFinite(rawPerPage)
      ? Math.max(1, Math.min(maxPageSize, Math.floor(rawPerPage)))
      : defaultPageSize

  return {
    page,
    perPage,
    offset: (page - 1) * perPage,
    limit: perPage,
  }
}

export function belongsToOrganization(
  record: { organizationId: string } | null | undefined,
  organizationId: string
): boolean {
  return Boolean(record) && record?.organizationId === organizationId
}

export function parseDeviceInfo(value: unknown): AgentReportDeviceInfo | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const record = value as Record<string, unknown>
  const deviceInfo: AgentReportDeviceInfo = {}

  if (typeof record.browser === "string" && record.browser.length > 0) {
    deviceInfo.browser = record.browser
  }
  if (typeof record.os === "string" && record.os.length > 0) {
    deviceInfo.os = record.os
  }
  if (typeof record.viewport === "string" && record.viewport.length > 0) {
    deviceInfo.viewport = record.viewport
  }

  return Object.keys(deviceInfo).length > 0 ? deviceInfo : null
}

export function parseMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

export function truncateLogMessage(message: string): {
  message: string
  messageTruncated: boolean
} {
  if (message.length <= AGENT_LOG_MESSAGE_PREVIEW_CHARS) {
    return { message, messageTruncated: false }
  }

  return {
    message: message.slice(0, AGENT_LOG_MESSAGE_PREVIEW_CHARS),
    messageTruncated: true,
  }
}

function asAttachmentType(value: string | null): "video" | "screenshot" | null {
  if (value === "video" || value === "screenshot") {
    return value
  }

  return null
}

export async function listReportsForOrganization(
  input: {
    createdAfter?: Date
    createdBefore?: Date
    organizationId: string
    page?: number
    perPage?: number
    search?: string
    status?: AgentReportStatus
  },
  store: AgentReportStore
): Promise<{ items: AgentReportListItem[]; pagination: PaginationMeta }> {
  const pagination = normalizeAgentListPagination(input)
  const { rows, total } = await store.listReports({
    createdAfter: input.createdAfter,
    createdBefore: input.createdBefore,
    organizationId: input.organizationId,
    page: pagination.page,
    perPage: pagination.perPage,
    search: input.search,
    status: input.status,
  })

  return {
    items: rows,
    pagination: buildPaginationMeta(total, pagination.page, pagination.perPage),
  }
}

async function requireOrgReport(
  input: { organizationId: string; reportId: string },
  store: AgentReportStore
): Promise<AgentReportRecord> {
  const report = await store.findReport(input)
  if (!report || report.organizationId !== input.organizationId) {
    throw new AgentReportNotFoundError()
  }

  return report
}

export async function getReportForOrganization(
  input: {
    organizationId: string
    reportId: string
  },
  store: AgentReportStore
): Promise<AgentReportDetail> {
  const report = await requireOrgReport(input, store)
  const actionsPagination = normalizeAgentEventPagination({
    perPage: AGENT_GET_REPORT_ACTIONS_LIMIT,
  })
  const logsPagination = normalizeAgentEventPagination({
    perPage: AGENT_GET_REPORT_LOGS_LIMIT,
  })
  const networkPagination = normalizeAgentEventPagination({
    perPage: AGENT_GET_REPORT_NETWORK_LIMIT,
  })

  const [
    actions,
    actionsCount,
    logs,
    logsCount,
    networkRequests,
    networkCount,
    transcript,
  ] = await Promise.all([
    store.listActions({
      limit: actionsPagination.limit,
      offset: 0,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.countActions({
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.listLogs({
      limit: logsPagination.limit,
      offset: 0,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.countLogs({
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.listNetworkRequests({
      limit: networkPagination.limit,
      offset: 0,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.countNetworkRequests({
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.findTranscript(input),
  ])

  return {
    actions: {
      items: actions,
      pagination: buildPaginationMeta(
        actionsCount,
        1,
        AGENT_GET_REPORT_ACTIONS_LIMIT
      ),
    },
    createdAt: report.createdAt.toISOString(),
    description: report.description,
    deviceInfo: parseDeviceInfo(report.deviceInfo),
    id: report.id,
    ingestion: {
      debuggerIngestedAt: report.debuggerIngestedAt?.toISOString() ?? null,
      debuggerIngestionError: report.debuggerIngestionError,
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      submissionStatus: report.submissionStatus,
    },
    logs: {
      items: logs.map((log) => ({
        ...log,
        ...truncateLogMessage(log.message),
      })),
      pagination: buildPaginationMeta(
        logsCount,
        1,
        AGENT_GET_REPORT_LOGS_LIMIT
      ),
    },
    metadata: parseMetadata(report.metadata),
    networkRequests: {
      items: networkRequests,
      pagination: buildPaginationMeta(
        networkCount,
        1,
        AGENT_GET_REPORT_NETWORK_LIMIT
      ),
    },
    organization: {
      id: report.organizationId,
      name: report.organizationName,
    },
    priority: report.priority,
    reporter: report.reporterName
      ? {
          name: report.reporterName,
        }
      : null,
    status: report.status,
    tags: Array.isArray(report.tags) ? report.tags : [],
    title: report.title || "Untitled Bug Report",
    transcript: transcript
      ? {
          completedAt: transcript.completedAt,
          error: transcript.error,
          language: transcript.language,
          model: transcript.model,
          segmentCount: transcript.segments.length,
          status: transcript.status,
          text: transcript.text,
        }
      : null,
    updatedAt: report.updatedAt.toISOString(),
    url: report.url,
    visibility: report.visibility,
  }
}

export async function listReportEventsForOrganization(
  input: {
    kind: AgentReportEventKind
    organizationId: string
    page?: number
    perPage?: number
    reportId: string
    search?: string
  },
  store: AgentReportStore
): Promise<
  AgentPaginatedEvents<
    AgentReportAction | AgentReportLog | AgentReportNetworkRequest
  >
> {
  await requireOrgReport(input, store)
  const pagination = normalizeAgentEventPagination(input)

  if (input.kind === "actions") {
    const [items, total] = await Promise.all([
      store.listActions({
        limit: pagination.limit,
        offset: pagination.offset,
        organizationId: input.organizationId,
        reportId: input.reportId,
      }),
      store.countActions({
        organizationId: input.organizationId,
        reportId: input.reportId,
      }),
    ])

    return {
      items,
      pagination: buildPaginationMeta(
        total,
        pagination.page,
        pagination.perPage
      ),
    }
  }

  if (input.kind === "logs") {
    const [items, total] = await Promise.all([
      store.listLogs({
        limit: pagination.limit,
        offset: pagination.offset,
        organizationId: input.organizationId,
        reportId: input.reportId,
      }),
      store.countLogs({
        organizationId: input.organizationId,
        reportId: input.reportId,
      }),
    ])

    return {
      items,
      pagination: buildPaginationMeta(
        total,
        pagination.page,
        pagination.perPage
      ),
    }
  }

  const [items, total] = await Promise.all([
    store.listNetworkRequests({
      limit: pagination.limit,
      offset: pagination.offset,
      organizationId: input.organizationId,
      reportId: input.reportId,
      search: input.search,
    }),
    store.countNetworkRequests({
      organizationId: input.organizationId,
      reportId: input.reportId,
      search: input.search,
    }),
  ])

  return {
    items,
    pagination: buildPaginationMeta(total, pagination.page, pagination.perPage),
  }
}

export async function getNetworkRequestForOrganization(
  input: {
    organizationId: string
    reportId: string
    requestId: string
  },
  store: AgentReportStore
): Promise<AgentNetworkRequestPayload> {
  await requireOrgReport(input, store)
  const payload = await store.findNetworkRequest(input)
  if (!payload) {
    throw new AgentReportNotFoundError("Network request not found")
  }

  return payload
}

export async function getReportArtifactsForOrganization(
  input: {
    organizationId: string
    reportId: string
  },
  store: AgentReportStore
): Promise<AgentReportArtifacts> {
  const report = await requireOrgReport(input, store)
  const attachmentType = asAttachmentType(report.attachmentType)
  const [captureUrl, thumbnailUrl] = await Promise.all([
    store.getArtifactUrl({
      expiresInSeconds: AGENT_ARTIFACT_URL_TTL_SECONDS,
      objectKey: report.captureKey,
    }),
    store.getArtifactUrl({
      expiresInSeconds: AGENT_ARTIFACT_URL_TTL_SECONDS,
      objectKey: report.thumbnailKey,
    }),
  ])

  return {
    attachmentType,
    expiresInSeconds: AGENT_ARTIFACT_URL_TTL_SECONDS,
    screenshotUrl: attachmentType === "screenshot" ? captureUrl : thumbnailUrl,
    thumbnailUrl,
    videoUrl: attachmentType === "video" ? captureUrl : null,
  }
}
