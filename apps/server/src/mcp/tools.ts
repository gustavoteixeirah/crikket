import type { AuthenticatedOrganizationApiKey } from "@crikket/auth/lib/organization-api-keys"
import { drizzleAgentReportStore } from "@crikket/bug-reports/lib/agent-report-store"
import {
  type AgentReportEventKind,
  type AgentReportStatus,
  type AgentReportStore,
  getNetworkRequestForOrganization,
  getReportArtifactsForOrganization,
  getReportForOrganization,
  listReportEventsForOrganization,
  listReportsForOrganization,
} from "@crikket/bug-reports/lib/agent-reports"

const REPORT_STATUSES = new Set<AgentReportStatus>([
  "open",
  "in_progress",
  "resolved",
  "closed",
])

const EVENT_KINDS = new Set<AgentReportEventKind>([
  "actions",
  "logs",
  "network",
])

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required.`)
  }

  return value.trim()
}

function optionalString(
  args: Record<string, unknown>,
  key: string
): string | undefined {
  const value = args[key]
  if (typeof value !== "string") {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function optionalPositiveInt(
  args: Record<string, unknown>,
  key: string
): number | undefined {
  const value = args[key]
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined
  }

  return Math.floor(value)
}

function optionalDate(
  args: Record<string, unknown>,
  key: string
): Date | undefined {
  const value = optionalString(args, key)
  if (!value) {
    return undefined
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${key} must be a valid ISO-8601 timestamp.`)
  }

  return parsed
}

export async function executeCrikketMcpTool(
  auth: AuthenticatedOrganizationApiKey,
  name: string,
  args: Record<string, unknown>,
  store: AgentReportStore = drizzleAgentReportStore
): Promise<unknown> {
  const organizationId = auth.organizationId

  if (name === "list_reports") {
    const statusValue = optionalString(args, "status")
    if (statusValue && !REPORT_STATUSES.has(statusValue as AgentReportStatus)) {
      throw new Error("status must be open, in_progress, resolved, or closed.")
    }

    return await listReportsForOrganization(
      {
        createdAfter: optionalDate(args, "createdAfter"),
        createdBefore: optionalDate(args, "createdBefore"),
        organizationId,
        page: optionalPositiveInt(args, "page"),
        perPage: optionalPositiveInt(args, "perPage"),
        search: optionalString(args, "search"),
        status: statusValue as AgentReportStatus | undefined,
      },
      store
    )
  }

  if (name === "get_report") {
    return await getReportForOrganization(
      {
        organizationId,
        reportId: requireString(args, "reportId"),
      },
      store
    )
  }

  if (name === "list_report_events") {
    const kind = requireString(args, "kind")
    if (!EVENT_KINDS.has(kind as AgentReportEventKind)) {
      throw new Error("kind must be actions, logs, or network.")
    }

    return await listReportEventsForOrganization(
      {
        kind: kind as AgentReportEventKind,
        organizationId,
        page: optionalPositiveInt(args, "page"),
        perPage: optionalPositiveInt(args, "perPage"),
        reportId: requireString(args, "reportId"),
        search: optionalString(args, "search"),
      },
      store
    )
  }

  if (name === "get_network_request") {
    return await getNetworkRequestForOrganization(
      {
        organizationId,
        reportId: requireString(args, "reportId"),
        requestId: requireString(args, "requestId"),
      },
      store
    )
  }

  if (name === "get_report_artifacts") {
    return await getReportArtifactsForOrganization(
      {
        organizationId,
        reportId: requireString(args, "reportId"),
      },
      store
    )
  }

  throw new Error(`Unknown tool: ${name}`)
}
