import {
  type AuthenticatedOrganizationApiKey,
  parseBearerToken,
} from "@crikket/auth/lib/organization-api-keys"
import {
  getReportContextForOrganization,
  parseReportContextFormat,
  serializeReportContext,
} from "@crikket/bug-reports/lib/agent-report-context"
import {
  AgentReportNotFoundError,
  type AgentReportStore,
} from "@crikket/bug-reports/lib/agent-reports"

const WWW_AUTHENTICATE = 'Bearer realm="crikket", charset="UTF-8"'

export type AuthenticateOrganizationApiKeyFn = (
  token: string
) => Promise<AuthenticatedOrganizationApiKey | null>

function jsonResponse(
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    status,
  })
}

function unauthorized(message: string): Response {
  return jsonResponse(
    401,
    { error: "unauthorized", message },
    { "www-authenticate": WWW_AUTHENTICATE }
  )
}

export async function handleReportContextRequest(input: {
  authenticate: AuthenticateOrganizationApiKeyFn
  format?: string | null
  reportId: string
  request: Request
  store: AgentReportStore
}): Promise<Response> {
  if (input.request.method === "OPTIONS") {
    return new Response(null, { status: 204 })
  }

  if (input.request.method !== "GET") {
    return jsonResponse(405, {
      error: "method_not_allowed",
      message: "Use GET /api/v1/reports/:id/context.",
    })
  }

  const token = parseBearerToken(input.request.headers.get("authorization"))
  if (!token) {
    return unauthorized(
      "Missing Authorization Bearer token. Create an organization API key in Settings → API Keys."
    )
  }

  const auth = await input.authenticate(token)
  if (!auth) {
    return unauthorized("Invalid or revoked organization API key.")
  }

  const format = parseReportContextFormat(input.format)
  if (!format) {
    return jsonResponse(400, {
      error: "invalid_format",
      message: "format must be json or markdown.",
    })
  }

  const reportId = input.reportId.trim()
  if (!reportId) {
    return jsonResponse(400, {
      error: "invalid_report_id",
      message: "report id is required.",
    })
  }

  try {
    const context = await getReportContextForOrganization(
      {
        organizationId: auth.organizationId,
        reportId,
      },
      input.store
    )
    const serialized = serializeReportContext(context, format)
    return new Response(serialized.body, {
      headers: {
        "content-type": serialized.contentType,
      },
      status: 200,
    })
  } catch (error) {
    if (error instanceof AgentReportNotFoundError) {
      return jsonResponse(404, {
        error: "not_found",
        message: error.message,
      })
    }

    throw error
  }
}
