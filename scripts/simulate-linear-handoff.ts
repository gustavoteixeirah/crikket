#!/usr/bin/env bun
/**
 * Simulate report.ready → Linear issue against a mocked Linear GraphQL API.
 *
 * Does not call Linear, Cursor, or any other external network.
 *
 *   bun run scripts/simulate-linear-handoff.ts
 */
import {
  CURSOR_AGENTS_API_URL,
  LINEAR_GRAPHQL_URL,
} from "../packages/bug-reports/src/lib/linear/constants"
import { shouldEnqueueCreateIssue } from "../packages/bug-reports/src/lib/linear/decisions"
import { buildHandoffLinks } from "../packages/bug-reports/src/lib/linear/handoff"
import {
  executeCreateLinearIssue,
  executeLaunchCursorAgent,
} from "../packages/bug-reports/src/lib/linear/pipeline"

const reportId = "report_sim_001"
const organizationEnabled = true

if (
  !shouldEnqueueCreateIssue({
    enabled: organizationEnabled,
    hasLinearIssue: false,
    requireEnabled: true,
    submissionReady: true,
  })
) {
  console.log("disabled: Linear integration is off; no issue would be created")
  process.exit(0)
}

const links = buildHandoffLinks({
  appBaseUrl: "https://crikket.kodegt.com",
  reportId,
})

const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  const body = init?.body ? JSON.parse(String(init.body)) : null

  if (url === LINEAR_GRAPHQL_URL) {
    const query = String(body.query ?? "")
    if (query.includes("issueCreate")) {
      return Response.json({
        data: {
          issueCreate: {
            success: true,
            issue: {
              id: "issue_sim",
              identifier: "KOD-999",
              title: body.variables.input.title,
              url: "https://linear.app/kodegt/issue/KOD-999",
            },
          },
        },
      })
    }

    if (query.includes("commentCreate")) {
      return Response.json({
        data: {
          commentCreate: {
            success: true,
            comment: {
              id: "comment_sim",
              url: "https://linear.app/kodegt/comment/sim",
            },
          },
        },
      })
    }
  }

  if (url === CURSOR_AGENTS_API_URL) {
    return Response.json(
      {
        agent: {
          id: "bc-sim",
          url: "https://cursor.com/agents/bc-sim",
        },
      },
      { status: 201 }
    )
  }

  return new Response("unmocked", { status: 599 })
}) as typeof fetch

const issue = await executeCreateLinearIssue({
  existingIssue: null,
  fetchImpl,
  integration: {
    cursorApiKey: "cursor_test_key",
    githubRef: "main",
    githubRepoUrl: "https://github.com/gustavoteixeirah/crikket",
    launchCloudAgent: false,
    linearApiKey: "lin_api_test",
    linearLabelIds: [],
    linearProjectId: "project_crikket",
    linearTeamId: "team_kodegt",
  },
  links,
  markdown: [
    "# Simulated checkout freeze",
    "",
    "Pay button does nothing after click.",
    "",
    "This payload is produced by scripts/simulate-linear-handoff.ts with mocked Linear HTTP.",
  ].join("\n"),
  reportId,
  reportTitle: "Simulated checkout freeze",
})

console.log("created:", issue.created)
console.log("identifier:", issue.issue.identifier)
console.log("url:", issue.issue.url)
console.log("shouldLaunchAgent:", issue.shouldLaunchAgent)
console.log("title:", issue.built.title)
console.log("--- description preview ---")
console.log(issue.built.description.slice(0, 1200))
console.log("---")

const again = await executeCreateLinearIssue({
  existingIssue: issue.issue,
  fetchImpl,
  integration: {
    cursorApiKey: "cursor_test_key",
    githubRef: "main",
    githubRepoUrl: "https://github.com/gustavoteixeirah/crikket",
    launchCloudAgent: false,
    linearApiKey: "lin_api_test",
    linearLabelIds: [],
    linearProjectId: "project_crikket",
    linearTeamId: "team_kodegt",
  },
  links,
  markdown: "# Simulated checkout freeze",
  reportId,
  reportTitle: "Simulated checkout freeze",
})

console.log("idempotent second create:", again.created === false)

const launched = await executeLaunchCursorAgent({
  existingAgent: null,
  existingIssue: issue.issue,
  fetchImpl,
  integration: {
    cursorApiKey: "cursor_test_key",
    githubRef: "main",
    githubRepoUrl: "https://github.com/gustavoteixeirah/crikket",
    launchCloudAgent: true,
    linearApiKey: "lin_api_test",
    linearLabelIds: [],
    linearProjectId: "project_crikket",
    linearTeamId: "team_kodegt",
  },
  links,
  markdown: "# Simulated checkout freeze",
  reportId,
  reportTitle: "Simulated checkout freeze",
})

console.log("agent url:", launched.agent.url)
console.log("linear comment posted:", launched.commented)
