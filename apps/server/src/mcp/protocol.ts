import type { AuthenticatedOrganizationApiKey } from "@crikket/auth/lib/organization-api-keys"

export const MCP_PROTOCOL_VERSIONS = [
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
  "2026-07-28",
] as const

export const DEFAULT_MCP_PROTOCOL_VERSION = "2025-03-26"
export const MCP_SERVER_NAME = "crikket"
export const MCP_SERVER_VERSION = "1.0.0"

export type JsonRpcId = string | number | null

export type JsonRpcRequest = {
  id?: JsonRpcId
  jsonrpc: "2.0"
  method: string
  params?: unknown
}

export type JsonRpcSuccess = {
  id: JsonRpcId
  jsonrpc: "2.0"
  result: unknown
}

export type JsonRpcError = {
  error: {
    code: number
    data?: unknown
    message: string
  }
  id: JsonRpcId
  jsonrpc: "2.0"
}

export type McpToolDefinition = {
  description: string
  inputSchema: Record<string, unknown>
  name: string
}

export type McpToolExecutor = (
  auth: AuthenticatedOrganizationApiKey,
  name: string,
  args: Record<string, unknown>
) => Promise<unknown>

const PARSE_ERROR = -32_700
const INVALID_REQUEST = -32_600
const METHOD_NOT_FOUND = -32_601
const INVALID_PARAMS = -32_602

export function negotiateMcpProtocolVersion(requested: unknown): string {
  if (
    typeof requested === "string" &&
    (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested
  }

  return DEFAULT_MCP_PROTOCOL_VERSION
}

export function parseJsonRpcRequest(value: unknown): JsonRpcRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  const candidate = value as Record<string, unknown>
  if (candidate.jsonrpc !== "2.0" || typeof candidate.method !== "string") {
    return null
  }

  return {
    id: candidate.id as JsonRpcId | undefined,
    jsonrpc: "2.0",
    method: candidate.method,
    params: candidate.params,
  }
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  return {
    error: data === undefined ? { code, message } : { code, data, message },
    id,
    jsonrpc: "2.0",
  }
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcSuccess {
  return {
    id,
    jsonrpc: "2.0",
    result,
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

async function handleToolsCall(input: {
  auth: AuthenticatedOrganizationApiKey
  executeTool: McpToolExecutor
  id: JsonRpcId
  params: unknown
  tools: McpToolDefinition[]
}): Promise<JsonRpcSuccess | JsonRpcError> {
  const params = asRecord(input.params)
  const name = params.name
  if (typeof name !== "string" || name.length === 0) {
    return jsonRpcError(input.id, INVALID_PARAMS, "Tool name is required.")
  }

  const tool = input.tools.find((entry) => entry.name === name)
  if (!tool) {
    return jsonRpcError(input.id, INVALID_PARAMS, `Unknown tool: ${name}`)
  }

  try {
    const result = await input.executeTool(
      input.auth,
      name,
      asRecord(params.arguments)
    )
    return jsonRpcResult(input.id, {
      content: [
        {
          text: JSON.stringify(result, null, 2),
          type: "text",
        },
      ],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tool call failed."
    return jsonRpcResult(input.id, {
      content: [
        {
          text: message,
          type: "text",
        },
      ],
      isError: true,
    })
  }
}

export async function handleMcpJsonRpcRequest(input: {
  auth: AuthenticatedOrganizationApiKey
  executeTool: McpToolExecutor
  request: JsonRpcRequest
  tools: McpToolDefinition[]
}): Promise<JsonRpcSuccess | JsonRpcError | null> {
  const { auth, executeTool, request, tools } = input
  const id = request.id ?? null

  if (request.method === "initialize") {
    const params = asRecord(request.params)
    return jsonRpcResult(id, {
      capabilities: {
        tools: {},
      },
      protocolVersion: negotiateMcpProtocolVersion(params.protocolVersion),
      serverInfo: {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
    })
  }

  if (
    request.method === "notifications/initialized" ||
    request.method === "initialized"
  ) {
    return null
  }

  if (request.method === "ping") {
    return jsonRpcResult(id, {})
  }

  if (request.method === "tools/list") {
    return jsonRpcResult(id, { tools })
  }

  if (request.method === "tools/call") {
    return await handleToolsCall({
      auth,
      executeTool,
      id,
      params: request.params,
      tools,
    })
  }

  if (request.method.startsWith("notifications/") || request.id === undefined) {
    return null
  }

  if (request.method === "resources/list") {
    return jsonRpcResult(id, { resources: [] })
  }

  if (request.method === "prompts/list") {
    return jsonRpcResult(id, { prompts: [] })
  }

  return jsonRpcError(
    id,
    METHOD_NOT_FOUND,
    `Method not found: ${request.method}`
  )
}

export function jsonRpcParseError(): JsonRpcError {
  return jsonRpcError(null, PARSE_ERROR, "Parse error")
}

export function jsonRpcInvalidRequest(): JsonRpcError {
  return jsonRpcError(null, INVALID_REQUEST, "Invalid Request")
}
