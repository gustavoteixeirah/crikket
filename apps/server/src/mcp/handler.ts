import {
  type AuthenticatedOrganizationApiKey,
  parseBearerToken,
} from "@crikket/auth/lib/organization-api-keys"
import {
  handleMcpJsonRpcRequest,
  jsonRpcInvalidRequest,
  jsonRpcParseError,
  type McpToolExecutor,
  parseJsonRpcRequest,
} from "./protocol"
import { CRIKKET_MCP_TOOLS } from "./tool-catalog"

const MCP_WWW_AUTHENTICATE = 'Bearer realm="crikket", charset="UTF-8"'

export type AuthenticateOrganizationApiKeyFn = (
  token: string
) => Promise<AuthenticatedOrganizationApiKey | null>

export function unauthorizedMcpResponse(message = "Unauthorized"): Response {
  return new Response(
    JSON.stringify({
      error: "unauthorized",
      message,
    }),
    {
      headers: {
        "content-type": "application/json",
        "www-authenticate": MCP_WWW_AUTHENTICATE,
      },
      status: 401,
    }
  )
}

export function methodNotAllowedMcpResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "method_not_allowed",
      message: "Use POST for Streamable HTTP MCP at /mcp.",
    }),
    {
      headers: {
        allow: "POST, OPTIONS",
        "content-type": "application/json",
      },
      status: 405,
    }
  )
}

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) {
    return null
  }

  return JSON.parse(text) as unknown
}

function jsonRpcHttpResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status,
  })
}

export async function handleMcpRequest(input: {
  authenticate: AuthenticateOrganizationApiKeyFn
  executeTool: McpToolExecutor
  request: Request
}): Promise<Response> {
  if (input.request.method === "OPTIONS") {
    return new Response(null, { status: 204 })
  }

  if (input.request.method !== "POST") {
    return methodNotAllowedMcpResponse()
  }

  const token = parseBearerToken(input.request.headers.get("authorization"))
  if (!token) {
    return unauthorizedMcpResponse(
      "Missing Authorization Bearer token. Create an organization API key in Settings → API Keys."
    )
  }

  const auth = await input.authenticate(token)
  if (!auth) {
    return unauthorizedMcpResponse("Invalid or revoked organization API key.")
  }

  let body: unknown
  try {
    body = await readJsonBody(input.request)
  } catch {
    return jsonRpcHttpResponse(jsonRpcParseError(), 400)
  }

  const rpcRequest = parseJsonRpcRequest(body)
  if (!rpcRequest) {
    return jsonRpcHttpResponse(jsonRpcInvalidRequest(), 400)
  }

  const rpcResponse = await handleMcpJsonRpcRequest({
    auth,
    executeTool: input.executeTool,
    request: rpcRequest,
    tools: CRIKKET_MCP_TOOLS,
  })

  if (rpcResponse === null) {
    return new Response(null, { status: 202 })
  }

  return jsonRpcHttpResponse(rpcResponse)
}
