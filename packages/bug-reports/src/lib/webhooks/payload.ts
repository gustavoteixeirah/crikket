import { REPORT_READY_EVENT, WEBHOOK_API_VERSION } from "./constants"

export interface ReportReadyDebuggerError {
  level: string
  message: string
  timestamp: string | null
}

export interface ReportReadyDebuggerSummary {
  actionCount: number
  consoleErrorCount: number
  consoleWarningCount: number
  failedNetworkRequestCount: number
  logCount: number
  networkRequestCount: number
  topErrors: ReportReadyDebuggerError[]
}

export interface ReportReadyMediaLink {
  appUrl: string
  contentType: string | null
  expiresAt: string | null
  expiresInSeconds: number | null
  kind: "screenshot" | "video" | "unknown"
  url: string | null
}

export interface ReportReadyEventPayload {
  apiVersion: typeof WEBHOOK_API_VERSION
  createdAt: string
  data: {
    organization: {
      id: string
      name: string
      slug: string
    }
    report: {
      browser: {
        name: string | null
        os: string | null
        viewport: string | null
      }
      debugger: ReportReadyDebuggerSummary
      description: string | null
      id: string
      media: ReportReadyMediaLink | null
      pageUrl: string | null
      reporter: {
        email: string | null
        id: string
        name: string
      } | null
      title: string | null
      url: string
    }
    test: boolean
  }
  id: string
  type: typeof REPORT_READY_EVENT
}

export interface BuildReportReadyEventInput {
  createdAt?: Date
  deliveryId: string
  media: ReportReadyMediaLink | null
  organization: {
    id: string
    name: string
    slug: string
  }
  report: {
    browser: {
      name: string | null
      os: string | null
      viewport: string | null
    }
    debugger: ReportReadyDebuggerSummary
    description: string | null
    id: string
    pageUrl: string | null
    reporter: {
      email: string | null
      id: string
      name: string
    } | null
    title: string | null
    url: string
  }
  test?: boolean
}

export function isFailedNetworkRequestStatus(status: number | null): boolean {
  if (status === null) {
    return true
  }

  return status >= 400
}

export function summarizeDebuggerForWebhook(input: {
  actionsCount: number
  logs: Array<{
    level: string
    message: string
    timestamp: Date | string | null
  }>
  networkRequests: Array<{ status: number | null }>
  topErrorLimit: number
}): ReportReadyDebuggerSummary {
  const consoleErrorCount = input.logs.filter(
    (log) => log.level === "error"
  ).length
  const consoleWarningCount = input.logs.filter(
    (log) => log.level === "warn"
  ).length
  const failedNetworkRequestCount = input.networkRequests.filter((request) =>
    isFailedNetworkRequestStatus(request.status)
  ).length

  const topErrors = input.logs
    .filter((log) => log.level === "error")
    .slice(0, input.topErrorLimit)
    .map((log) => ({
      level: log.level,
      message: log.message,
      timestamp:
        log.timestamp instanceof Date
          ? log.timestamp.toISOString()
          : log.timestamp,
    }))

  return {
    actionCount: input.actionsCount,
    consoleErrorCount,
    consoleWarningCount,
    failedNetworkRequestCount,
    logCount: input.logs.length,
    networkRequestCount: input.networkRequests.length,
    topErrors,
  }
}

export function buildReportReadyEventPayload(
  input: BuildReportReadyEventInput
): ReportReadyEventPayload {
  return {
    apiVersion: WEBHOOK_API_VERSION,
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    data: {
      organization: input.organization,
      report: {
        browser: input.report.browser,
        debugger: input.report.debugger,
        description: input.report.description,
        id: input.report.id,
        media: input.media,
        pageUrl: input.report.pageUrl,
        reporter: input.report.reporter,
        title: input.report.title,
        url: input.report.url,
      },
      test: input.test === true,
    },
    id: input.deliveryId,
    type: REPORT_READY_EVENT,
  }
}

export function stringifyWebhookPayload(payload: unknown): string {
  return JSON.stringify(payload)
}
