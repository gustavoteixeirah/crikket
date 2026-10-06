import { describe, expect, it } from "bun:test"
import type { AuthenticatedOrganizationApiKey } from "@crikket/auth/lib/organization-api-keys"
import { handleMcpRequest } from "../src/mcp/handler"
import { CRIKKET_MCP_TOOLS } from "../src/mcp/tool-catalog"

const orgAAuth: AuthenticatedOrganizationApiKey = {
  keyId: "key_a",
  organizationId: "org_a",
  scope: "read",
}

const unusedTool = () => Promise.resolve({})

function mcpRequest(input: {
  authorization?: string
  body?: unknown
  method?: string
}): Request {
  const headers = new Headers({
    "content-type": "application/json",
  })
  if (input.authorization) {
    headers.set("authorization", input.authorization)
  }

  return new Request("https://crikket.kodegt.com/mcp", {
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    headers,
    method: input.method ?? "POST",
  })
}

describe("MCP HTTP handler", () => {
  it("rejects missing and invalid bearer tokens before any tool runs", async () => {
    let toolCalls = 0
    const missing = await handleMcpRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      executeTool: () => {
        toolCalls += 1
        return Promise.resolve({})
      },
      request: mcpRequest({
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      }),
    })

    expect(missing.status).toBe(401)
    expect(toolCalls).toBe(0)

    const invalid = await handleMcpRequest({
      authenticate: () => Promise.resolve(null),
      executeTool: () => {
        toolCalls += 1
        return Promise.resolve({})
      },
      request: mcpRequest({
        authorization: "Bearer crik_ak_invalid",
        body: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      }),
    })

    expect(invalid.status).toBe(401)
    expect(toolCalls).toBe(0)
  })

  it("initializes Streamable HTTP and lists agent report tools", async () => {
    const initialize = await handleMcpRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      executeTool: unusedTool,
      request: mcpRequest({
        authorization: "Bearer crik_ak_valid",
        body: {
          id: 1,
          jsonrpc: "2.0",
          method: "initialize",
          params: {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "test", version: "1" },
          },
        },
      }),
    })

    expect(initialize.status).toBe(200)
    const initialized = (await initialize.json()) as {
      result: { protocolVersion: string; serverInfo: { name: string } }
    }
    expect(initialized.result.protocolVersion).toBe("2025-03-26")
    expect(initialized.result.serverInfo.name).toBe("crikket")

    const list = await handleMcpRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      executeTool: unusedTool,
      request: mcpRequest({
        authorization: "Bearer crik_ak_valid",
        body: { id: 2, jsonrpc: "2.0", method: "tools/list" },
      }),
    })

    const listed = (await list.json()) as {
      result: { tools: Array<{ name: string }> }
    }
    expect(listed.result.tools.map((tool) => tool.name)).toEqual(
      CRIKKET_MCP_TOOLS.map((tool) => tool.name)
    )
  })

  it("scopes tool calls to the authenticated organization, not a client-supplied org", async () => {
    const calls: Array<{
      args: Record<string, unknown>
      auth: AuthenticatedOrganizationApiKey
      name: string
    }> = []

    const response = await handleMcpRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      executeTool: (auth, name, args) => {
        calls.push({ args, auth, name })
        return Promise.resolve({ items: [], org: auth.organizationId })
      },
      request: mcpRequest({
        authorization: "Bearer crik_ak_org_a",
        body: {
          id: 3,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "get_report",
            arguments: {
              organizationId: "org_b",
              reportId: "report_from_org_b",
            },
          },
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.auth.organizationId).toBe("org_a")
    expect(calls[0]?.args.organizationId).toBe("org_b")
    const payload = (await response.json()) as {
      result: { content: Array<{ text: string }> }
    }
    expect(payload.result.content[0]?.text).toContain("org_a")
  })

  it("returns 405 for GET probes of the Streamable HTTP endpoint", async () => {
    const response = await handleMcpRequest({
      authenticate: () => Promise.resolve(orgAAuth),
      executeTool: unusedTool,
      request: mcpRequest({
        authorization: "Bearer crik_ak_valid",
        method: "GET",
      }),
    })

    expect(response.status).toBe(405)
  })
})
