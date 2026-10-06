import { db } from "@crikket/db"
import { organization, user } from "@crikket/db/schema/auth"
import {
  bugReport,
  bugReportAction,
  bugReportLog,
  bugReportNetworkRequest,
} from "@crikket/db/schema/bug-report"
import { bugReportTranscript } from "@crikket/db/schema/transcription"
import { env } from "@crikket/env/server"
import { and, asc, count, eq, gte, isNull, or } from "drizzle-orm"
import { getStorageProvider } from "../storage"
import { toTranscriptView } from "../transcription/transcript-view"
import { buildBugReportAppUrl } from "./app-url"
import {
  WEBHOOK_DEBUGGER_TOP_ERRORS,
  WEBHOOK_MEDIA_URL_TTL_SECONDS,
} from "./constants"
import {
  buildReportReadyEventPayload,
  buildTranscriptReadyEventPayload,
  type ReportReadyEventPayload,
  type ReportReadyMediaLink,
  type TranscriptReadyEventPayload,
} from "./payload"

interface DeviceInfoShape {
  browser?: unknown
  os?: unknown
  viewport?: unknown
}

export async function buildReportReadyPayloadForReport(input: {
  bugReportId: string
  deliveryId: string
  organizationId: string
  test?: boolean
}): Promise<ReportReadyEventPayload | null> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      attachmentType: true,
      captureContentType: true,
      captureKey: true,
      description: true,
      deviceInfo: true,
      id: true,
      organizationId: true,
      reporterId: true,
      title: true,
      url: true,
    },
  })

  if (!report) {
    return null
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, report.organizationId),
    columns: {
      id: true,
      name: true,
      slug: true,
    },
  })

  if (!org) {
    return null
  }

  const reporter = report.reporterId
    ? await db.query.user.findFirst({
        where: eq(user.id, report.reporterId),
        columns: {
          email: true,
          id: true,
          name: true,
        },
      })
    : null

  const debuggerSummary = await loadDebuggerSummary(report.id)
  const media = await resolveWebhookMediaLink({
    attachmentType: report.attachmentType,
    captureContentType: report.captureContentType,
    captureKey: report.captureKey,
    reportId: report.id,
  })
  const browser = extractBrowserMetadata(report.deviceInfo)

  return buildReportReadyEventPayload({
    deliveryId: input.deliveryId,
    media,
    organization: org,
    report: {
      browser,
      debugger: debuggerSummary,
      description: report.description,
      id: report.id,
      pageUrl: report.url,
      reporter: reporter
        ? {
            email: reporter.email,
            id: reporter.id,
            name: reporter.name,
          }
        : null,
      title: report.title,
      url: buildBugReportAppUrl(report.id),
    },
    test: input.test,
  })
}

export async function buildTranscriptReadyPayloadForReport(input: {
  bugReportId: string
  deliveryId: string
  organizationId: string
  test?: boolean
}): Promise<TranscriptReadyEventPayload | null> {
  const report = await db.query.bugReport.findFirst({
    where: and(
      eq(bugReport.id, input.bugReportId),
      eq(bugReport.organizationId, input.organizationId)
    ),
    columns: {
      id: true,
      organizationId: true,
      title: true,
    },
  })

  if (!report) {
    return null
  }

  const org = await db.query.organization.findFirst({
    where: eq(organization.id, report.organizationId),
    columns: {
      id: true,
      name: true,
      slug: true,
    },
  })

  if (!org) {
    return null
  }

  const transcriptRow = await db.query.bugReportTranscript.findFirst({
    where: and(
      eq(bugReportTranscript.bugReportId, report.id),
      eq(bugReportTranscript.organizationId, report.organizationId)
    ),
  })

  if (!transcriptRow) {
    return null
  }

  const transcript = toTranscriptView(transcriptRow)

  return buildTranscriptReadyEventPayload({
    deliveryId: input.deliveryId,
    organization: org,
    report: {
      id: report.id,
      title: report.title,
      url: buildBugReportAppUrl(report.id),
    },
    test: input.test,
    transcript: {
      completedAt: transcript.completedAt,
      durationSeconds: transcript.durationSeconds,
      language: transcript.language,
      model: transcript.model,
      segmentCount: transcript.segments.length,
      status: transcript.status,
      text: transcript.text,
    },
  })
}

export function buildSyntheticReportReadyPayload(input: {
  deliveryId: string
  organization: {
    id: string
    name: string
    slug: string
  }
}): ReportReadyEventPayload {
  return buildReportReadyEventPayload({
    deliveryId: input.deliveryId,
    media: {
      appUrl: buildBugReportAppUrl("test_report"),
      contentType: null,
      expiresAt: null,
      expiresInSeconds: null,
      kind: "unknown",
      url: null,
    },
    organization: input.organization,
    report: {
      browser: {
        name: "Crikket Test",
        os: null,
        viewport: null,
      },
      debugger: {
        actionCount: 0,
        consoleErrorCount: 0,
        consoleWarningCount: 0,
        failedNetworkRequestCount: 0,
        logCount: 0,
        networkRequestCount: 0,
        topErrors: [],
      },
      description: "Synthetic webhook test event from organization settings.",
      id: "test_report",
      pageUrl: null,
      reporter: null,
      title: "Crikket webhook test",
      url: buildBugReportAppUrl("test_report"),
    },
    test: true,
  })
}

async function loadDebuggerSummary(bugReportId: string) {
  const [actionRow] = await db
    .select({ value: count() })
    .from(bugReportAction)
    .where(eq(bugReportAction.bugReportId, bugReportId))
  const [logRow] = await db
    .select({ value: count() })
    .from(bugReportLog)
    .where(eq(bugReportLog.bugReportId, bugReportId))
  const [errorLogRow] = await db
    .select({ value: count() })
    .from(bugReportLog)
    .where(
      and(
        eq(bugReportLog.bugReportId, bugReportId),
        eq(bugReportLog.level, "error")
      )
    )
  const [warningLogRow] = await db
    .select({ value: count() })
    .from(bugReportLog)
    .where(
      and(
        eq(bugReportLog.bugReportId, bugReportId),
        eq(bugReportLog.level, "warn")
      )
    )
  const [networkRow] = await db
    .select({ value: count() })
    .from(bugReportNetworkRequest)
    .where(eq(bugReportNetworkRequest.bugReportId, bugReportId))
  const [failedNetworkRow] = await db
    .select({ value: count() })
    .from(bugReportNetworkRequest)
    .where(
      and(
        eq(bugReportNetworkRequest.bugReportId, bugReportId),
        or(
          isNull(bugReportNetworkRequest.status),
          gte(bugReportNetworkRequest.status, 400)
        )
      )
    )

  const errorLogs = await db
    .select({
      level: bugReportLog.level,
      message: bugReportLog.message,
      timestamp: bugReportLog.timestamp,
    })
    .from(bugReportLog)
    .where(
      and(
        eq(bugReportLog.bugReportId, bugReportId),
        eq(bugReportLog.level, "error")
      )
    )
    .orderBy(asc(bugReportLog.timestamp))
    .limit(WEBHOOK_DEBUGGER_TOP_ERRORS)

  return {
    actionCount: actionRow?.value ?? 0,
    consoleErrorCount: errorLogRow?.value ?? 0,
    consoleWarningCount: warningLogRow?.value ?? 0,
    failedNetworkRequestCount: failedNetworkRow?.value ?? 0,
    logCount: logRow?.value ?? 0,
    networkRequestCount: networkRow?.value ?? 0,
    topErrors: errorLogs.map((log) => ({
      level: log.level,
      message: log.message,
      timestamp: log.timestamp.toISOString(),
    })),
  }
}

function extractBrowserMetadata(deviceInfo: unknown): {
  name: string | null
  os: string | null
  viewport: string | null
} {
  if (!deviceInfo || typeof deviceInfo !== "object") {
    return { name: null, os: null, viewport: null }
  }

  const info = deviceInfo as DeviceInfoShape
  return {
    name: asNullableString(info.browser),
    os: asNullableString(info.os),
    viewport: asNullableString(info.viewport),
  }
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null
}

async function resolveWebhookMediaLink(input: {
  attachmentType: string | null
  captureContentType: string | null
  captureKey: string | null
  reportId: string
}): Promise<ReportReadyMediaLink | null> {
  if (!input.captureKey) {
    return null
  }

  const kind =
    input.attachmentType === "screenshot" || input.attachmentType === "video"
      ? input.attachmentType
      : "unknown"
  const ephemeral = !env.STORAGE_PUBLIC_URL
  const expiresInSeconds = ephemeral ? WEBHOOK_MEDIA_URL_TTL_SECONDS : null
  const expiresAt = expiresInSeconds
    ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
    : null

  let url: string | null = null
  try {
    url = await getStorageProvider().getUrl(input.captureKey, {
      expiresInSeconds: WEBHOOK_MEDIA_URL_TTL_SECONDS,
    })
  } catch {
    url = null
  }

  return {
    appUrl: buildBugReportAppUrl(input.reportId),
    contentType: input.captureContentType,
    expiresAt,
    expiresInSeconds,
    kind,
    url,
  }
}
