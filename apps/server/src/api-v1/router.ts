import {
  type AuthenticatedOrganizationApiKey,
  ORGANIZATION_API_KEY_SCOPE_READ,
  parseBearerToken,
} from "@crikket/auth/lib/organization-api-keys"
import {
  getReportContextForOrganization,
  parseReportContextFormat,
  serializeReportContext,
} from "@crikket/bug-reports/lib/agent-report-context"
import {
  type AgentReportEventKind,
  AgentReportNotFoundError,
  type AgentReportStatus,
  type AgentReportStore,
  getNetworkRequestForOrganization,
  getReportArtifactsForOrganization,
  getReportForOrganization,
  listReportEventsForOrganization,
  listReportsForOrganization,
} from "@crikket/bug-reports/lib/agent-reports"
import {
  ApiClientError,
  badRequestApiError,
  forbiddenApiError,
  jsonApiErrorResponse,
  jsonApiResponse,
  methodNotAllowedApiError,
  notFoundApiError,
  rateLimitedApiError,
  unauthorizedApiError,
} from "./errors"
import { CRIKKET_API_V1_OPENAPI } from "./openapi"

const REPORT_STATUSES = new Set<AgentReportStatus>([
  "closed",
  "in_progress",
  "open",
  "resolved",
])

const EVENT_KINDS = new Set<AgentReportEventKind>([
  "actions",
  "logs",
  "network",
])

const ARTIFACT_KINDS = new Set(["screenshot", "video"])
const MAX_SEARCH_CHARS = 200
const POSITIVE_INT_PATTERN = /^\d+$/
const NETWORK_ROUTE_PATTERN = /^\/api\/v1\/reports\/([^/]+)\/network\/([^/]+)$/
const NESTED_REPORT_ROUTE_PATTERN =
  /^\/api\/v1\/reports\/([^/]+)\/(artifacts|context|download|events)$/
const REPORT_ROUTE_PATTERN = /^\/api\/v1\/reports\/([^/]+)$/

export type AuthenticateOrganizationApiKeyFn = (
  token: string
) => Promise<AuthenticatedOrganizationApiKey | null>

export type ApiV1RateLimitDecision =
  | { allowed: true; headers: Record<string, string> }
  | {
      allowed: false
      headers: Record<string, string>
      message: string
    }

export type ApiV1RateLimitFn = (
  request: Request,
  options?: {
    skipIp?: boolean
    skipUser?: boolean
    userId?: string | null
  }
) => Promise<ApiV1RateLimitDecision>

type ApiV1Route =
  | { name: "openapi" }
  | { name: "list_reports" }
  | { name: "get_report"; reportId: string }
  | { name: "get_report_context"; reportId: string }
  | { name: "list_events"; reportId: string }
  | { name: "get_network"; reportId: string; requestId: string }
  | { name: "get_artifacts"; reportId: string }
  | { name: "download"; reportId: string }

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1)
  }

  return pathname
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    throw badRequestApiError("invalid_path", "Path parameter is not valid.")
  }
}

export function matchApiV1Route(pathname: string): ApiV1Route | null {
  const path = normalizePathname(pathname)
  if (path === "/api/v1/openapi.json") {
    return { name: "openapi" }
  }

  if (path === "/api/v1/reports") {
    return { name: "list_reports" }
  }

  const network = NETWORK_ROUTE_PATTERN.exec(path)
  if (network?.[1] && network[2]) {
    return {
      name: "get_network",
      reportId: decodePathSegment(network[1]),
      requestId: decodePathSegment(network[2]),
    }
  }

  const nested = NESTED_REPORT_ROUTE_PATTERN.exec(path)
  if (nested?.[1] && nested[2]) {
    const reportId = decodePathSegment(nested[1])
    const suffix = nested[2]
    if (suffix === "artifacts") {
      return { name: "get_artifacts", reportId }
    }
    if (suffix === "context") {
      return { name: "get_report_context", reportId }
    }
    if (suffix === "download") {
      return { name: "download", reportId }
    }
    return { name: "list_events", reportId }
  }

  const report = REPORT_ROUTE_PATTERN.exec(path)
  if (report?.[1]) {
    return { name: "get_report", reportId: decodePathSegment(report[1]) }
  }

  return null
}

function queryValue(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)
  if (value === null) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function optionalSearch(url: URL): string | undefined {
  const search = queryValue(url, "search")
  if (search && search.length > MAX_SEARCH_CHARS) {
    throw badRequestApiError(
      "invalid_search",
      `search must be at most ${MAX_SEARCH_CHARS} characters.`
    )
  }

  return search
}

function optionalPositiveInt(url: URL, key: string): number | undefined {
  const raw = queryValue(url, key)
  if (!raw) {
    return undefined
  }

  if (!POSITIVE_INT_PATTERN.test(raw)) {
    throw badRequestApiError(
      "invalid_query",
      `${key} must be a positive integer.`
    )
  }

  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw badRequestApiError(
      "invalid_query",
      `${key} must be a positive integer.`
    )
  }

  return parsed
}

function optionalDate(url: URL, key: string): Date | undefined {
  const raw = queryValue(url, key)
  if (!raw) {
    return undefined
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    throw badRequestApiError(
      "invalid_query",
      `${key} must be a valid ISO-8601 timestamp.`
    )
  }

  return parsed
}

function optionalStatus(url: URL): AgentReportStatus | undefined {
  const status = queryValue(url, "status")
  if (!status) {
    return undefined
  }

  if (!REPORT_STATUSES.has(status as AgentReportStatus)) {
    throw badRequestApiError(
      "invalid_status",
      "status must be open, in_progress, resolved, or closed."
    )
  }

  return status as AgentReportStatus
}

function requireEventKind(url: URL): AgentReportEventKind {
  const kind = queryValue(url, "kind")
  if (!kind) {
    throw badRequestApiError(
      "invalid_kind",
      "kind is required and must be actions, logs, or network."
    )
  }

  if (!EVENT_KINDS.has(kind as AgentReportEventKind)) {
    throw badRequestApiError(
      "invalid_kind",
      "kind must be actions, logs, or network."
    )
  }

  return kind as AgentReportEventKind
}

function requireReportId(reportId: string): string {
  const trimmed = reportId.trim()
  if (!trimmed) {
    throw badRequestApiError("invalid_report_id", "report id is required.")
  }

  return trimmed
}

async function applyRateLimit(input: {
  auth: AuthenticatedOrganizationApiKey
  rateLimit?: ApiV1RateLimitFn
  request: Request
}): Promise<Record<string, string>> {
  if (!input.rateLimit) {
    return {}
  }

  const ipDecision = await input.rateLimit(input.request, { skipUser: true })
  if (!ipDecision.allowed) {
    throw rateLimitedApiError(ipDecision.message, ipDecision.headers)
  }

  const keyDecision = await input.rateLimit(input.request, {
    skipIp: true,
    userId: `org-api-key:${input.auth.keyId}`,
  })
  if (!keyDecision.allowed) {
    throw rateLimitedApiError(keyDecision.message, keyDecision.headers)
  }

  return { ...ipDecision.headers, ...keyDecision.headers }
}

async function authenticateRequest(
  request: Request,
  authenticate: AuthenticateOrganizationApiKeyFn
): Promise<AuthenticatedOrganizationApiKey> {
  const token = parseBearerToken(request.headers.get("authorization"))
  if (!token) {
    throw unauthorizedApiError(
      "Missing Authorization Bearer token. Create an organization API key in Settings → API Keys."
    )
  }

  const auth = await authenticate(token)
  if (!auth) {
    throw unauthorizedApiError("Invalid or revoked organization API key.")
  }

  if (auth.scope !== ORGANIZATION_API_KEY_SCOPE_READ) {
    throw forbiddenApiError("This API key cannot read reports.")
  }

  return auth
}

async function handleDownload(input: {
  organizationId: string
  reportId: string
  store: AgentReportStore
  url: URL
}): Promise<Response> {
  const artifact = queryValue(input.url, "artifact")
  if (artifact) {
    if (!ARTIFACT_KINDS.has(artifact)) {
      throw badRequestApiError(
        "invalid_artifact",
        "artifact must be video or screenshot."
      )
    }

    const artifacts = await getReportArtifactsForOrganization(
      {
        organizationId: input.organizationId,
        reportId: input.reportId,
      },
      input.store
    )
    const target =
      artifact === "video" ? artifacts.videoUrl : artifacts.screenshotUrl
    if (!target) {
      throw notFoundApiError(`${artifact} artifact not available.`)
    }

    return Response.redirect(target, 302)
  }

  const context = await getReportContextForOrganization(
    {
      organizationId: input.organizationId,
      reportId: input.reportId,
    },
    input.store
  )

  return new Response(JSON.stringify(context), {
    headers: {
      "content-disposition": `attachment; filename="crikket-report-${input.reportId}.json"`,
      "content-type": "application/json",
    },
    status: 200,
  })
}

async function dispatchAuthenticatedRoute(input: {
  auth: AuthenticatedOrganizationApiKey
  route: Exclude<ApiV1Route, { name: "openapi" }>
  store: AgentReportStore
  url: URL
}): Promise<Response> {
  const organizationId = input.auth.organizationId

  if (input.route.name === "list_reports") {
    const result = await listReportsForOrganization(
      {
        createdAfter: optionalDate(input.url, "createdAfter"),
        createdBefore: optionalDate(input.url, "createdBefore"),
        organizationId,
        page: optionalPositiveInt(input.url, "page"),
        perPage: optionalPositiveInt(input.url, "perPage"),
        search: optionalSearch(input.url),
        status: optionalStatus(input.url),
      },
      input.store
    )
    return jsonApiResponse(200, result)
  }

  const reportId = requireReportId(input.route.reportId)

  if (input.route.name === "get_report") {
    return jsonApiResponse(
      200,
      await getReportForOrganization({ organizationId, reportId }, input.store)
    )
  }

  if (input.route.name === "get_report_context") {
    const format = parseReportContextFormat(queryValue(input.url, "format"))
    if (!format) {
      throw badRequestApiError(
        "invalid_format",
        "format must be json or markdown."
      )
    }

    const context = await getReportContextForOrganization(
      { organizationId, reportId },
      input.store
    )
    const serialized = serializeReportContext(context, format)
    return new Response(serialized.body, {
      headers: { "content-type": serialized.contentType },
      status: 200,
    })
  }

  if (input.route.name === "list_events") {
    return jsonApiResponse(
      200,
      await listReportEventsForOrganization(
        {
          kind: requireEventKind(input.url),
          organizationId,
          page: optionalPositiveInt(input.url, "page"),
          perPage: optionalPositiveInt(input.url, "perPage"),
          reportId,
          search: optionalSearch(input.url),
        },
        input.store
      )
    )
  }

  if (input.route.name === "get_network") {
    return jsonApiResponse(
      200,
      await getNetworkRequestForOrganization(
        {
          organizationId,
          reportId,
          requestId: requireReportId(input.route.requestId),
        },
        input.store
      )
    )
  }

  if (input.route.name === "get_artifacts") {
    return jsonApiResponse(
      200,
      await getReportArtifactsForOrganization(
        { organizationId, reportId },
        input.store
      )
    )
  }

  return await handleDownload({
    organizationId,
    reportId,
    store: input.store,
    url: input.url,
  })
}

export async function handleApiV1Request(input: {
  authenticate: AuthenticateOrganizationApiKeyFn
  rateLimit?: ApiV1RateLimitFn
  request: Request
  store: AgentReportStore
}): Promise<Response> {
  if (input.request.method === "OPTIONS") {
    return new Response(null, { status: 204 })
  }

  const url = new URL(input.request.url)

  try {
    const route = matchApiV1Route(url.pathname)
    if (!route) {
      return jsonApiErrorResponse(
        notFoundApiError("Unknown /api/v1 route. See GET /api/v1/openapi.json.")
      )
    }

    if (route.name === "openapi") {
      if (input.request.method !== "GET") {
        return jsonApiErrorResponse(
          methodNotAllowedApiError("Use GET /api/v1/openapi.json.")
        )
      }

      return jsonApiResponse(200, CRIKKET_API_V1_OPENAPI)
    }

    if (input.request.method !== "GET") {
      return jsonApiErrorResponse(
        methodNotAllowedApiError("Use GET for /api/v1 report endpoints.")
      )
    }

    const auth = await authenticateRequest(input.request, input.authenticate)
    const rateLimitHeaders = await applyRateLimit({
      auth,
      rateLimit: input.rateLimit,
      request: input.request,
    })
    const response = await dispatchAuthenticatedRoute({
      auth,
      route,
      store: input.store,
      url,
    })

    if (Object.keys(rateLimitHeaders).length === 0) {
      return response
    }

    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(rateLimitHeaders)) {
      headers.set(key, value)
    }

    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    })
  } catch (error) {
    if (error instanceof ApiClientError) {
      return jsonApiErrorResponse(error)
    }

    if (error instanceof AgentReportNotFoundError) {
      return jsonApiErrorResponse(notFoundApiError(error.message))
    }

    throw error
  }
}

export function handleReportContextRequest(input: {
  authenticate: AuthenticateOrganizationApiKeyFn
  format?: string | null
  reportId: string
  request: Request
  store: AgentReportStore
}): Promise<Response> {
  return handleApiV1Request({
    authenticate: input.authenticate,
    request: input.request,
    store: input.store,
  })
}
