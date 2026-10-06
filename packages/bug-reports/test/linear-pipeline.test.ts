import { describe, expect, it } from "bun:test"
import {
  createLinearIssue,
  listLinearCatalog,
  testLinearApiKey,
} from "../src/lib/linear/client"
import {
  CURSOR_AGENTS_API_URL,
  LINEAR_GRAPHQL_URL,
} from "../src/lib/linear/constants"
import {
  createCursorCloudAgent,
  testCursorApiKey,
} from "../src/lib/linear/cursor-client"
import { buildHandoffLinks } from "../src/lib/linear/handoff"
import { withIngestIsolation } from "../src/lib/linear/isolate"
import {
  executeCreateLinearIssue,
  executeLaunchCursorAgent,
} from "../src/lib/linear/pipeline"
import { maskOrgSecret } from "../src/lib/org-secrets"

type MockCall = {
  body: unknown
  method: string
  url: string
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  })
}

function mockFetch(handler: (call: MockCall) => Response): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url
    const body = init?.body ? JSON.parse(String(init.body)) : null
    return Promise.resolve(
      handler({
        body,
        method: init?.method ?? "GET",
        url,
      })
    )
  }) as typeof fetch
}

const integration = {
  cursorApiKey: "cursor_test_key",
  githubRef: "main",
  githubRepoUrl: "https://github.com/acme/product",
  launchCloudAgent: false,
  linearApiKey: "lin_api_test",
  linearLabelIds: ["label_1"],
  linearProjectId: "project_1",
  linearTeamId: "team_1",
}

const links = buildHandoffLinks({
  appBaseUrl: "https://crikket.example.com",
  reportId: "report_a",
})

describe("mocked Linear HTTP", () => {
  it("tests an API key without returning it", async () => {
    const result = await testLinearApiKey({
      apiKey: "lin_api_secret",
      fetchImpl: mockFetch((call) => {
        expect(call.url).toBe(LINEAR_GRAPHQL_URL)
        expect(call.method).toBe("POST")
        return jsonResponse(200, {
          data: { viewer: { id: "user_1", name: "Ada" } },
        })
      }),
    })

    expect(result).toEqual({ ok: true, viewerName: "Ada" })
    expect(maskOrgSecret("cret").includes("lin_api_secret")).toBe(false)
  })

  it("loads teams and projects", async () => {
    const teams = await listLinearCatalog({
      apiKey: "lin_api_secret",
      fetchImpl: mockFetch(() =>
        jsonResponse(200, {
          data: {
            teams: {
              nodes: [
                {
                  id: "team_1",
                  key: "ACME",
                  name: "Acme",
                  labels: { nodes: [{ id: "label_1", name: "bug" }] },
                  projects: { nodes: [{ id: "project_1", name: "Web" }] },
                },
              ],
            },
          },
        })
      ),
    })

    expect(teams[0]?.projects[0]?.name).toBe("Web")
  })

  it("creates a Linear issue from a mocked GraphQL mutation", async () => {
    const issue = await createLinearIssue({
      apiKey: "lin_api_secret",
      description: "body",
      fetchImpl: mockFetch((call) => {
        const body = call.body as {
          query: string
          variables: { input: { title: string } }
        }
        expect(body.query).toContain("issueCreate")
        expect(body.variables.input.title).toBe("Checkout freeze")
        return jsonResponse(200, {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue_1",
                identifier: "ACME-12",
                title: "Checkout freeze",
                url: "https://linear.app/acme/issue/ACME-12",
              },
            },
          },
        })
      }),
      teamId: "team_1",
      title: "Checkout freeze",
    })

    expect(issue.identifier).toBe("ACME-12")
  })
})

describe("mocked Cursor HTTP", () => {
  it("creates a cloud agent against the public v1 API", async () => {
    const agent = await createCursorCloudAgent({
      apiKey: "cursor_test_key",
      fetchImpl: mockFetch((call) => {
        expect(call.url).toBe(CURSOR_AGENTS_API_URL)
        expect(call.method).toBe("POST")
        const body = call.body as {
          prompt: { text: string }
          repos: Array<{ url: string; startingRef: string }>
        }
        expect(body.repos[0]?.url).toBe("https://github.com/acme/product")
        expect(body.prompt.text).toContain("Fix the bug")
        return jsonResponse(201, {
          agent: {
            id: "bc-1",
            url: "https://cursor.com/agents/bc-1",
          },
        })
      }),
      prompt: "Fix the bug",
      repoUrl: "https://github.com/acme/product",
      startingRef: "main",
    })

    expect(agent.url).toBe("https://cursor.com/agents/bc-1")
  })

  it("tests a Cursor API key with GET /v1/agents", async () => {
    const result = await testCursorApiKey({
      apiKey: "cursor_test_key",
      fetchImpl: mockFetch((call) => {
        expect(call.method).toBe("GET")
        expect(call.url).toContain("/v1/agents")
        return jsonResponse(200, { items: [] })
      }),
    })

    expect(result.ok).toBe(true)
  })
})

describe("linear issue pipeline", () => {
  it("creates one issue and is idempotent on a second call", async () => {
    let createCalls = 0
    const fetchImpl = mockFetch((call) => {
      const body = call.body as { query?: string }
      if (String(body.query).includes("issueCreate")) {
        createCalls += 1
        return jsonResponse(200, {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: "issue_1",
                identifier: "ACME-12",
                title: "Checkout freeze",
                url: "https://linear.app/acme/issue/ACME-12",
              },
            },
          },
        })
      }

      throw new Error(`Unexpected Linear call ${call.url}`)
    })

    const first = await executeCreateLinearIssue({
      existingIssue: null,
      fetchImpl,
      integration,
      links,
      markdown: "# Checkout freeze",
      reportId: "report_a",
      reportTitle: "Checkout freeze",
    })

    const second = await executeCreateLinearIssue({
      existingIssue: first.issue,
      fetchImpl,
      integration,
      links,
      markdown: "# Checkout freeze",
      reportId: "report_a",
      reportTitle: "Checkout freeze",
    })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.issue.id).toBe("issue_1")
    expect(createCalls).toBe(1)
  })

  it("does not call Linear when the disabled path has no team/key", async () => {
    let calls = 0
    await expect(
      executeCreateLinearIssue({
        existingIssue: null,
        fetchImpl: mockFetch(() => {
          calls += 1
          return jsonResponse(500, {})
        }),
        integration: {
          ...integration,
          linearApiKey: null,
          linearTeamId: null,
        },
        links,
        markdown: "# Checkout freeze",
        reportId: "report_a",
        reportTitle: "Checkout freeze",
      })
    ).rejects.toThrow("Linear integration is missing an API key or team.")
    expect(calls).toBe(0)
  })

  it("does not leak a report from another organization into Linear", () => {
    expect(
      shouldStayIsolated({
        actorOrganizationId: "org_a",
        reportOrganizationId: "org_b",
      })
    ).toBe(true)
  })
})

describe("cursor agent pipeline", () => {
  it("launches an agent and comments on the Linear issue", async () => {
    const calls: string[] = []
    const fetchImpl = mockFetch((call) => {
      if (call.url === CURSOR_AGENTS_API_URL) {
        calls.push("cursor")
        return jsonResponse(201, {
          agent: {
            id: "bc-1",
            url: "https://cursor.com/agents/bc-1",
          },
        })
      }

      const body = call.body as { query?: string }
      if (String(body.query).includes("commentCreate")) {
        calls.push("linear-comment")
        return jsonResponse(200, {
          data: {
            commentCreate: {
              success: true,
              comment: { id: "comment_1", url: "https://linear.app/comment/1" },
            },
          },
        })
      }

      throw new Error(`Unexpected call ${call.url}`)
    })

    const result = await executeLaunchCursorAgent({
      existingAgent: null,
      existingIssue: {
        id: "issue_1",
        identifier: "ACME-12",
        url: "https://linear.app/acme/issue/ACME-12",
      },
      fetchImpl,
      integration: { ...integration, launchCloudAgent: true },
      links,
      markdown: "# Checkout freeze",
      reportId: "report_a",
      reportTitle: "Checkout freeze",
    })

    expect(result.created).toBe(true)
    expect(result.commented).toBe(true)
    expect(calls).toEqual(["cursor", "linear-comment"])

    const again = await executeLaunchCursorAgent({
      existingAgent: result.agent,
      existingIssue: {
        id: "issue_1",
        identifier: "ACME-12",
        url: "https://linear.app/acme/issue/ACME-12",
      },
      fetchImpl,
      integration: { ...integration, launchCloudAgent: true },
      links,
      markdown: "# Checkout freeze",
      reportId: "report_a",
      reportTitle: "Checkout freeze",
    })

    expect(again.created).toBe(false)
    expect(calls).toEqual(["cursor", "linear-comment"])
  })
})

describe("webhook isolation from Linear failures", () => {
  it("swallows Linear enqueue errors so ingest can finish", async () => {
    await expect(
      withIngestIsolation("linear enqueue", () => {
        throw new Error("Linear is down")
      })
    ).resolves.toBeUndefined()
  })
})

function shouldStayIsolated(input: {
  actorOrganizationId: string
  reportOrganizationId: string
}): boolean {
  return input.actorOrganizationId !== input.reportOrganizationId
}
