import { describe, expect, it } from "bun:test"
import { LINEAR_DESCRIPTION_MAX_CHARS } from "../src/lib/linear/constants"
import {
  assertReportBelongsToOrg,
  shouldEnqueueCreateIssue,
  shouldEnqueueLaunchAgent,
} from "../src/lib/linear/decisions"
import {
  buildHandoffLinks,
  buildLinearIssueDescription,
  isGithubRepoUrl,
  suggestedAgentBranch,
  truncateLinearTitle,
} from "../src/lib/linear/handoff"

describe("linear handoff packaging", () => {
  const links = buildHandoffLinks({
    appBaseUrl: "https://crikket.example.com",
    reportId: "report_abc",
  })

  it("builds report, context API, and MCP links", () => {
    expect(links.reportUrl).toBe("https://crikket.example.com/s/report_abc")
    expect(links.contextApiUrl).toBe(
      "https://crikket.example.com/api/v1/reports/report_abc/context"
    )
    expect(links.mcpUrl).toBe("https://crikket.example.com/mcp")
  })

  it("includes truncated context, report links, and a ready-to-use handoff section", () => {
    const built = buildLinearIssueDescription({
      contextMarkdown: "# Checkout freeze\n\nPay button does nothing.",
      launchCloudAgent: false,
      links,
      repo: {
        githubRef: "main",
        githubRepoUrl: "https://github.com/acme/product",
      },
      reportId: "report_abc",
      reportTitle: "Checkout freeze",
    })

    expect(built.title).toBe("Checkout freeze")
    expect(built.description).toContain(
      "https://crikket.example.com/s/report_abc"
    )
    expect(built.description).toContain("/api/v1/reports/report_abc/context")
    expect(built.description).toContain("Pay button does nothing.")
    expect(built.description).toContain("## Cloud agent handoff")
    expect(built.description).toContain("https://github.com/acme/product")
    expect(built.description).toContain(suggestedAgentBranch("report_abc"))
    expect(built.description).toContain(
      "Automatic Cursor cloud agent launch is **off**"
    )
    expect(built.description).toContain("crik_ak_YOUR_KEY_HERE")
    expect(built.agentPrompt).toContain("Pay button does nothing.")
    expect(built.truncated).toBe(false)
  })

  it("truncates oversized Linear descriptions", () => {
    const built = buildLinearIssueDescription({
      contextMarkdown: "x".repeat(LINEAR_DESCRIPTION_MAX_CHARS + 50),
      launchCloudAgent: true,
      links,
      repo: null,
      reportId: "report_abc",
      reportTitle: "Huge",
    })

    expect(built.truncated).toBe(true)
    expect(built.description.length).toBeLessThanOrEqual(
      LINEAR_DESCRIPTION_MAX_CHARS
    )
    expect(built.description).toContain("truncated")
  })

  it("truncates Linear titles", () => {
    expect(truncateLinearTitle("  ")).toBe("Untitled Bug Report")
    expect(truncateLinearTitle("a".repeat(300)).length).toBe(255)
  })

  it("validates GitHub repo URLs", () => {
    expect(isGithubRepoUrl("https://github.com/acme/product")).toBe(true)
    expect(isGithubRepoUrl("https://github.com/acme/product.git")).toBe(true)
    expect(isGithubRepoUrl("http://github.com/acme/product")).toBe(false)
    expect(isGithubRepoUrl("https://gitlab.com/acme/product")).toBe(false)
  })
})

describe("linear handoff decisions", () => {
  it("does not enqueue when the integration is disabled", () => {
    expect(
      shouldEnqueueCreateIssue({
        enabled: false,
        hasLinearIssue: false,
        requireEnabled: true,
        submissionReady: true,
      })
    ).toBe(false)
  })

  it("is idempotent when a Linear issue already exists", () => {
    expect(
      shouldEnqueueCreateIssue({
        enabled: true,
        hasLinearIssue: true,
        requireEnabled: true,
        submissionReady: true,
      })
    ).toBe(false)
  })

  it("does not enqueue before the report is ready", () => {
    expect(
      shouldEnqueueCreateIssue({
        enabled: true,
        hasLinearIssue: false,
        requireEnabled: true,
        submissionReady: false,
      })
    ).toBe(false)
  })

  it("allows a manual create even when auto-create is off", () => {
    expect(
      shouldEnqueueCreateIssue({
        enabled: false,
        hasLinearIssue: false,
        requireEnabled: false,
        submissionReady: true,
      })
    ).toBe(true)
  })

  it("keeps automatic agent launch off unless the org toggle is on", () => {
    expect(
      shouldEnqueueLaunchAgent({
        hasCursorAgent: false,
        launchCloudAgent: false,
        requireEnabled: true,
      })
    ).toBe(false)
  })

  it("isolates reports across organizations", () => {
    expect(() =>
      assertReportBelongsToOrg({
        organizationId: "org_a",
        reportOrganizationId: "org_b",
      })
    ).toThrow("Bug report does not belong to this organization.")
  })
})
