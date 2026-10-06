import {
  type AgentReportAction,
  type AgentReportArtifacts,
  type AgentReportLog,
  type AgentReportNetworkRequest,
  AgentReportNotFoundError,
  type AgentReportRecord,
  type AgentReportStore,
  belongsToOrganization,
  getReportArtifactsForOrganization,
  parseDeviceInfo,
  parseMetadata,
  truncateLogMessage,
} from "./agent-reports"

export const AGENT_CONTEXT_ACTION_LIMIT = 150
export const AGENT_CONTEXT_LOG_LIMIT = 150
export const AGENT_CONTEXT_NETWORK_LIMIT = 100
export const AGENT_CONTEXT_TIMELINE_MAX = 200

const HIGHLIGHTED_LOG_LEVELS = new Set([
  "error",
  "exception",
  "fatal",
  "uncaught",
])

export type AgentReportContextFormat = "json" | "markdown"

export type AgentContextTimelineKind = "action" | "log" | "network"

export type AgentContextOmitted = {
  actions: number
  logs: number
  network: number
}

export type AgentContextTimelineEvent = {
  highlighted: boolean
  id: string
  kind: AgentContextTimelineKind
  offset: number | null
  summary: string
  timestamp: string
}

export type AgentReportContext = {
  createdAt: string
  description: string | null
  environment: {
    browser?: string
    os?: string
    viewport?: string
  } | null
  id: string
  ingestion: {
    debuggerIngestedAt: string | null
    debuggerIngestionError: string | null
    debuggerIngestionStatus: string
    submissionStatus: string
  }
  markdown: string
  media: AgentReportArtifacts
  omitted: AgentContextOmitted
  organization: {
    id: string
    name: string
  }
  pageTitle: string | null
  priority: string
  reporter: {
    name: string | null
  } | null
  status: string
  tags: string[]
  timeline: AgentContextTimelineEvent[]
  title: string
  transcript: string | null
  updatedAt: string
  url: string | null
  visibility: string
}

export function parsePageTitle(metadata: unknown): string | null {
  const record = parseMetadata(metadata)
  const pageTitle = record?.pageTitle
  if (typeof pageTitle !== "string") {
    return null
  }

  const trimmed = pageTitle.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseReportContextFormat(
  value: string | null | undefined
): AgentReportContextFormat | null {
  if (value == null || value.trim().length === 0) {
    return "json"
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === "json" || normalized === "markdown") {
    return normalized
  }

  return null
}

export function isHighlightedLogLevel(level: string): boolean {
  return HIGHLIGHTED_LOG_LEVELS.has(level.trim().toLowerCase())
}

export function isHighlightedNetworkStatus(status: number | null): boolean {
  return status !== null && (status === 0 || status >= 400)
}

export function trailingWindow(
  total: number,
  limit: number
): { limit: number; offset: number } {
  const take = Math.min(Math.max(0, limit), Math.max(0, total))
  return {
    limit: take,
    offset: Math.max(0, total - take),
  }
}

export function compareTimelineEvents(
  left: AgentContextTimelineEvent,
  right: AgentContextTimelineEvent
): number {
  const byTime = left.timestamp.localeCompare(right.timestamp)
  if (byTime !== 0) {
    return byTime
  }

  const leftOffset = left.offset ?? Number.POSITIVE_INFINITY
  const rightOffset = right.offset ?? Number.POSITIVE_INFINITY
  if (leftOffset !== rightOffset) {
    return leftOffset - rightOffset
  }

  return left.id.localeCompare(right.id)
}

function actionSummary(action: AgentReportAction): string {
  if (action.target) {
    return `${action.type} ${action.target}`
  }

  return action.type
}

function networkSummary(request: AgentReportNetworkRequest): string {
  const statusLabel =
    request.status === null ? "failed" : String(request.status)
  if (request.duration === null) {
    return `${request.method} ${request.url} → ${statusLabel}`
  }

  return `${request.method} ${request.url} → ${statusLabel} (${request.duration}ms)`
}

export function toActionTimelineEvent(
  action: AgentReportAction
): AgentContextTimelineEvent {
  return {
    highlighted: false,
    id: action.id,
    kind: "action",
    offset: action.offset,
    summary: actionSummary(action),
    timestamp: action.timestamp,
  }
}

export function toLogTimelineEvent(
  log: AgentReportLog
): AgentContextTimelineEvent {
  const truncated = truncateLogMessage(log.message)
  return {
    highlighted: isHighlightedLogLevel(log.level),
    id: log.id,
    kind: "log",
    offset: log.offset,
    summary: `[${log.level}] ${truncated.message}`,
    timestamp: log.timestamp,
  }
}

export function toNetworkTimelineEvent(
  request: AgentReportNetworkRequest
): AgentContextTimelineEvent {
  return {
    highlighted: isHighlightedNetworkStatus(request.status),
    id: request.id,
    kind: "network",
    offset: request.offset,
    summary: networkSummary(request),
    timestamp: request.timestamp,
  }
}

export function mergeContextTimeline(
  actions: AgentReportAction[],
  logs: AgentReportLog[],
  network: AgentReportNetworkRequest[],
  maxEvents = AGENT_CONTEXT_TIMELINE_MAX
): AgentContextTimelineEvent[] {
  const merged = [
    ...actions.map(toActionTimelineEvent),
    ...logs.map(toLogTimelineEvent),
    ...network.map(toNetworkTimelineEvent),
  ].sort(compareTimelineEvents)

  if (merged.length <= maxEvents) {
    return merged
  }

  const highlighted = merged.filter((event) => event.highlighted)
  if (highlighted.length >= maxEvents) {
    return highlighted.slice(0, maxEvents)
  }

  const remaining = maxEvents - highlighted.length
  const keptNormal = merged
    .filter((event) => !event.highlighted)
    .slice(0, remaining)

  return [...highlighted, ...keptNormal].sort(compareTimelineEvents)
}

function countByKind(
  timeline: AgentContextTimelineEvent[],
  kind: AgentContextTimelineKind
): number {
  return timeline.filter((event) => event.kind === kind).length
}

function omittedCount(total: number, kept: number): number {
  return Math.max(0, total - kept)
}

function metadataLine(
  label: string,
  value: string | null | undefined
): string | null {
  if (!value) {
    return null
  }

  return `- **${label}:** ${value}`
}

function formatOffsetSuffix(offset: number | null): string {
  if (offset === null) {
    return ""
  }

  return ` +${offset}ms`
}

function formatTimelineMarkdownLine(event: AgentContextTimelineEvent): string {
  const marker = event.highlighted ? " **ERROR**" : ""
  return `- \`${event.timestamp}\`${formatOffsetSuffix(event.offset)}${marker} ${event.kind} ${event.summary}`
}

function formatOmittedMarkdown(omitted: AgentContextOmitted): string | null {
  const parts: string[] = []
  if (omitted.actions > 0) {
    parts.push(`${omitted.actions} actions`)
  }
  if (omitted.logs > 0) {
    parts.push(`${omitted.logs} console logs`)
  }
  if (omitted.network > 0) {
    parts.push(`${omitted.network} network requests`)
  }
  if (parts.length === 0) {
    return null
  }

  return `_Omitted ${parts.join(", ")} that did not fit this package. Use list_report_events for the rest._`
}

function formatMediaMarkdown(media: AgentReportArtifacts): string[] {
  const lines = ["## Media", ""]
  const expiry = `expires in ${media.expiresInSeconds}s`

  if (media.videoUrl) {
    lines.push(`- Video (${expiry}): ${media.videoUrl}`)
  }
  if (media.screenshotUrl) {
    lines.push(`- Screenshot (${expiry}): ${media.screenshotUrl}`)
  }
  if (media.thumbnailUrl && media.thumbnailUrl !== media.screenshotUrl) {
    lines.push(`- Thumbnail (${expiry}): ${media.thumbnailUrl}`)
  }
  if (!(media.videoUrl || media.screenshotUrl || media.thumbnailUrl)) {
    lines.push("- No capture media on this report.")
  }

  return lines
}

export function formatReportContextMarkdown(
  context: Omit<AgentReportContext, "markdown">
): string {
  const environment = context.environment
  const metadata = [
    metadataLine("URL", context.url),
    metadataLine("Page", context.pageTitle),
    metadataLine("Reporter", context.reporter?.name),
    metadataLine("Organization", context.organization.name),
    metadataLine("Browser", environment?.browser),
    metadataLine("OS", environment?.os),
    metadataLine("Viewport", environment?.viewport),
    metadataLine("Created", context.createdAt),
    metadataLine("Updated", context.updatedAt),
    metadataLine(
      "Tags",
      context.tags.length > 0 ? context.tags.join(", ") : null
    ),
  ].filter((line): line is string => line !== null)

  const description = context.description?.trim() || "No description provided."
  const transcript =
    context.transcript?.trim() || "No transcript is available yet."
  const omitted = formatOmittedMarkdown(context.omitted)
  const timelineLines =
    context.timeline.length > 0
      ? context.timeline.map(formatTimelineMarkdownLine)
      : ["- No recorded actions, logs, or network requests."]

  return [
    `# ${context.title}`,
    "",
    `Status: ${context.status} · Priority: ${context.priority} · ID: \`${context.id}\``,
    "",
    "## Metadata",
    "",
    ...metadata,
    "",
    "## Description",
    "",
    description,
    "",
    "## Transcript",
    "",
    transcript,
    "",
    ...formatMediaMarkdown(context.media),
    "",
    "## Timeline",
    "",
    "Events marked **ERROR** are console errors or failed network requests.",
    "",
    ...timelineLines,
    ...(omitted ? ["", omitted] : []),
    "",
  ].join("\n")
}

async function requireOrgReport(
  input: { organizationId: string; reportId: string },
  store: AgentReportStore
): Promise<AgentReportRecord> {
  const report = await store.findReport(input)
  if (!(report && belongsToOrganization(report, input.organizationId))) {
    throw new AgentReportNotFoundError()
  }

  return report
}

export async function getReportContextForOrganization(
  input: {
    organizationId: string
    reportId: string
  },
  store: AgentReportStore
): Promise<AgentReportContext> {
  const report = await requireOrgReport(input, store)
  const [actionCount, logCount, networkCount] = await Promise.all([
    store.countActions(input),
    store.countLogs(input),
    store.countNetworkRequests(input),
  ])

  const actionWindow = trailingWindow(actionCount, AGENT_CONTEXT_ACTION_LIMIT)
  const logWindow = trailingWindow(logCount, AGENT_CONTEXT_LOG_LIMIT)
  const networkWindow = trailingWindow(
    networkCount,
    AGENT_CONTEXT_NETWORK_LIMIT
  )

  const [actions, logs, network, media] = await Promise.all([
    store.listActions({
      ...actionWindow,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.listLogs({
      ...logWindow,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    store.listNetworkRequests({
      ...networkWindow,
      organizationId: input.organizationId,
      reportId: input.reportId,
    }),
    getReportArtifactsForOrganization(input, store),
  ])

  const timeline = mergeContextTimeline(actions, logs, network)
  const omitted: AgentContextOmitted = {
    actions: omittedCount(actionCount, countByKind(timeline, "action")),
    logs: omittedCount(logCount, countByKind(timeline, "log")),
    network: omittedCount(networkCount, countByKind(timeline, "network")),
  }

  const context = {
    createdAt: report.createdAt.toISOString(),
    description: report.description,
    environment: parseDeviceInfo(report.deviceInfo),
    id: report.id,
    ingestion: {
      debuggerIngestedAt: report.debuggerIngestedAt?.toISOString() ?? null,
      debuggerIngestionError: report.debuggerIngestionError,
      debuggerIngestionStatus: report.debuggerIngestionStatus,
      submissionStatus: report.submissionStatus,
    },
    media,
    omitted,
    organization: {
      id: report.organizationId,
      name: report.organizationName,
    },
    pageTitle: parsePageTitle(report.metadata),
    priority: report.priority,
    reporter: report.reporterName ? { name: report.reporterName } : null,
    status: report.status,
    tags: Array.isArray(report.tags) ? report.tags : [],
    timeline,
    title: report.title || "Untitled Bug Report",
    transcript: null,
    updatedAt: report.updatedAt.toISOString(),
    url: report.url,
    visibility: report.visibility,
  }

  return {
    ...context,
    markdown: formatReportContextMarkdown(context),
  }
}

export function serializeReportContext(
  context: AgentReportContext,
  format: AgentReportContextFormat
): { body: string; contentType: string } {
  if (format === "markdown") {
    return {
      body: context.markdown,
      contentType: "text/markdown; charset=utf-8",
    }
  }

  return {
    body: JSON.stringify(context),
    contentType: "application/json",
  }
}
