import { db } from "@crikket/db"
import {
  bugReport,
  bugReportAction,
  bugReportLog,
  bugReportNetworkRequest,
} from "@crikket/db/schema/bug-report"
import { bugReportTranscript } from "@crikket/db/schema/transcription"
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm"
import type {
  AgentReportListItem,
  AgentReportRecord,
  AgentReportStore,
} from "./agent-reports"
import { resolveArtifactUrl } from "./storage"
import { toTranscriptView } from "./transcription/transcript-view"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function asUnknownRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null
  }

  return value
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null
  }

  const result: Record<string, string> = {}

  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string") {
      continue
    }

    result[key] = entryValue
  }

  return Object.keys(result).length > 0 ? result : null
}

function asAttachmentType(value: string | null): "video" | "screenshot" | null {
  if (value === "video" || value === "screenshot") {
    return value
  }

  return null
}

function buildListWhere(query: {
  createdAfter?: Date
  createdBefore?: Date
  organizationId: string
  search?: string
  status?: string
}): SQL | undefined {
  const filters: SQL[] = [eq(bugReport.organizationId, query.organizationId)]

  if (query.status) {
    filters.push(eq(bugReport.status, query.status))
  }

  if (query.createdAfter) {
    filters.push(gte(bugReport.createdAt, query.createdAfter))
  }

  if (query.createdBefore) {
    filters.push(lte(bugReport.createdAt, query.createdBefore))
  }

  if (query.search) {
    const searchValue = `%${query.search}%`
    const searchCondition = or(
      ilike(bugReport.title, searchValue),
      ilike(bugReport.description, searchValue),
      ilike(bugReport.url, searchValue)
    )
    if (searchCondition) {
      filters.push(searchCondition)
    }
  }

  return filters.length === 1 ? filters[0] : and(...filters)
}

function buildOrgReportCondition(input: {
  organizationId: string
  reportId: string
}) {
  return and(
    eq(bugReport.id, input.reportId),
    eq(bugReport.organizationId, input.organizationId)
  )
}

export const drizzleAgentReportStore: AgentReportStore = {
  async countActions(input) {
    const [result] = await db
      .select({ value: count() })
      .from(bugReportAction)
      .innerJoin(bugReport, eq(bugReportAction.bugReportId, bugReport.id))
      .where(buildOrgReportCondition(input))

    return result?.value ?? 0
  },
  async countLogs(input) {
    const [result] = await db
      .select({ value: count() })
      .from(bugReportLog)
      .innerJoin(bugReport, eq(bugReportLog.bugReportId, bugReport.id))
      .where(buildOrgReportCondition(input))

    return result?.value ?? 0
  },
  async countNetworkRequests(input) {
    const conditions = [buildOrgReportCondition(input)]
    if (input.search) {
      const searchValue = `%${input.search}%`
      const searchCondition = or(
        ilike(bugReportNetworkRequest.method, searchValue),
        ilike(bugReportNetworkRequest.url, searchValue)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    const [result] = await db
      .select({ value: count() })
      .from(bugReportNetworkRequest)
      .innerJoin(
        bugReport,
        eq(bugReportNetworkRequest.bugReportId, bugReport.id)
      )
      .where(and(...conditions))

    return result?.value ?? 0
  },
  async findNetworkRequest(input) {
    const [request] = await db
      .select({
        id: bugReportNetworkRequest.id,
        method: bugReportNetworkRequest.method,
        requestBody: bugReportNetworkRequest.requestBody,
        requestHeaders: bugReportNetworkRequest.requestHeaders,
        responseBody: bugReportNetworkRequest.responseBody,
        responseHeaders: bugReportNetworkRequest.responseHeaders,
        status: bugReportNetworkRequest.status,
        url: bugReportNetworkRequest.url,
      })
      .from(bugReportNetworkRequest)
      .innerJoin(
        bugReport,
        eq(bugReportNetworkRequest.bugReportId, bugReport.id)
      )
      .where(
        and(
          buildOrgReportCondition(input),
          eq(bugReportNetworkRequest.id, input.requestId)
        )
      )
      .limit(1)

    if (!request) {
      return null
    }

    return {
      id: request.id,
      method: request.method,
      requestBody: request.requestBody,
      requestHeaders: asStringRecord(request.requestHeaders),
      responseBody: request.responseBody,
      responseHeaders: asStringRecord(request.responseHeaders),
      status: request.status,
      url: request.url,
    }
  },
  async findReport(input) {
    const report = await db.query.bugReport.findFirst({
      where: and(
        eq(bugReport.id, input.reportId),
        eq(bugReport.organizationId, input.organizationId)
      ),
      with: {
        organization: true,
        reporter: true,
      },
    })

    if (!report) {
      return null
    }

    const record: AgentReportRecord = {
      attachmentType: report.attachmentType,
      captureKey: report.captureKey,
      createdAt: report.createdAt,
      debuggerIngestedAt: report.debuggerIngestedAt,
      debuggerIngestionError: report.debuggerIngestionError,
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      description: report.description,
      deviceInfo: report.deviceInfo,
      id: report.id,
      metadata: report.metadata,
      organizationId: report.organizationId,
      organizationName: report.organization.name,
      priority: report.priority,
      reporterName: report.reporter?.name ?? null,
      status: report.status,
      submissionStatus: report.submissionStatus,
      tags: report.tags,
      thumbnailKey: report.thumbnailKey,
      title: report.title,
      updatedAt: report.updatedAt,
      url: report.url,
      visibility: report.visibility,
    }

    return record
  },
  async findTranscript(input) {
    const row = await db.query.bugReportTranscript.findFirst({
      where: and(
        eq(bugReportTranscript.bugReportId, input.reportId),
        eq(bugReportTranscript.organizationId, input.organizationId)
      ),
    })

    return row ? toTranscriptView(row) : null
  },
  getArtifactUrl(input) {
    return resolveArtifactUrl({
      expiresInSeconds: input.expiresInSeconds,
      objectKey: input.objectKey,
    })
  },
  async listActions(input) {
    const actions = await db
      .select({
        id: bugReportAction.id,
        metadata: bugReportAction.metadata,
        offset: bugReportAction.offset,
        target: bugReportAction.target,
        timestamp: bugReportAction.timestamp,
        type: bugReportAction.type,
      })
      .from(bugReportAction)
      .innerJoin(bugReport, eq(bugReportAction.bugReportId, bugReport.id))
      .where(buildOrgReportCondition(input))
      .orderBy(asc(bugReportAction.timestamp))
      .limit(input.limit)
      .offset(input.offset)

    return actions.map((action) => ({
      id: action.id,
      metadata: asUnknownRecord(action.metadata),
      offset: action.offset,
      target: action.target,
      timestamp: action.timestamp.toISOString(),
      type: action.type,
    }))
  },
  async listLogs(input) {
    const logs = await db
      .select({
        id: bugReportLog.id,
        level: bugReportLog.level,
        message: bugReportLog.message,
        metadata: bugReportLog.metadata,
        offset: bugReportLog.offset,
        timestamp: bugReportLog.timestamp,
      })
      .from(bugReportLog)
      .innerJoin(bugReport, eq(bugReportLog.bugReportId, bugReport.id))
      .where(buildOrgReportCondition(input))
      .orderBy(asc(bugReportLog.timestamp))
      .limit(input.limit)
      .offset(input.offset)

    return logs.map((log) => ({
      id: log.id,
      level: log.level,
      message: log.message,
      messageTruncated: false,
      metadata: asUnknownRecord(log.metadata),
      offset: log.offset,
      timestamp: log.timestamp.toISOString(),
    }))
  },
  async listNetworkRequests(input) {
    const conditions = [buildOrgReportCondition(input)]
    if (input.search) {
      const searchValue = `%${input.search}%`
      const searchCondition = or(
        ilike(bugReportNetworkRequest.method, searchValue),
        ilike(bugReportNetworkRequest.url, searchValue)
      )
      if (searchCondition) {
        conditions.push(searchCondition)
      }
    }

    const requests = await db
      .select({
        duration: bugReportNetworkRequest.duration,
        id: bugReportNetworkRequest.id,
        method: bugReportNetworkRequest.method,
        offset: bugReportNetworkRequest.offset,
        status: bugReportNetworkRequest.status,
        timestamp: bugReportNetworkRequest.timestamp,
        url: bugReportNetworkRequest.url,
      })
      .from(bugReportNetworkRequest)
      .innerJoin(
        bugReport,
        eq(bugReportNetworkRequest.bugReportId, bugReport.id)
      )
      .where(and(...conditions))
      .orderBy(asc(bugReportNetworkRequest.timestamp))
      .limit(input.limit)
      .offset(input.offset)

    return requests.map((request) => ({
      duration: request.duration,
      id: request.id,
      method: request.method,
      offset: request.offset,
      status: request.status,
      timestamp: request.timestamp.toISOString(),
      url: request.url,
    }))
  },
  async listReports(query) {
    const whereClause = buildListWhere(query)
    const offset = (query.page - 1) * query.perPage

    const [countResult, reports] = await Promise.all([
      db.select({ value: count() }).from(bugReport).where(whereClause),
      db.query.bugReport.findMany({
        limit: query.perPage,
        offset,
        orderBy: [desc(bugReport.createdAt)],
        where: whereClause,
        with: {
          reporter: true,
        },
      }),
    ])

    const rows: AgentReportListItem[] = reports.map((report) => ({
      attachmentType: asAttachmentType(report.attachmentType),
      createdAt: report.createdAt.toISOString(),
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      description: report.description,
      hasCapture: Boolean(report.captureKey),
      id: report.id,
      priority: report.priority,
      reporterName: report.reporter?.name ?? null,
      status: report.status,
      submissionStatus: report.submissionStatus,
      title: report.title || "Untitled Bug Report",
      updatedAt: report.updatedAt.toISOString(),
      url: report.url,
    }))

    return {
      rows,
      total: countResult[0]?.value ?? 0,
    }
  },
}
