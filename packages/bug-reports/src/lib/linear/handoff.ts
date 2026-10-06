import {
  LINEAR_DEFAULT_GITHUB_REF,
  LINEAR_DESCRIPTION_MAX_CHARS,
  LINEAR_ISSUE_TITLE_MAX,
} from "./constants"

export type LinearHandoffLinks = {
  contextApiUrl: string
  mcpUrl: string
  reportUrl: string
}

export type LinearHandoffRepo = {
  githubRef: string
  githubRepoUrl: string
}

export type BuiltHandoff = {
  agentPrompt: string
  description: string
  title: string
  truncated: boolean
}

const TRUNCATION_NOTICE = `

_This description was truncated to fit Linear’s size limit. Fetch the full agent context from the report context URL above._
`

export function truncateLinearTitle(title: string | null | undefined): string {
  const trimmed = title?.trim() || "Untitled Bug Report"
  if (trimmed.length <= LINEAR_ISSUE_TITLE_MAX) {
    return trimmed
  }

  return `${trimmed.slice(0, LINEAR_ISSUE_TITLE_MAX - 1)}…`
}

export function truncateLinearDescription(markdown: string): {
  text: string
  truncated: boolean
} {
  if (markdown.length <= LINEAR_DESCRIPTION_MAX_CHARS) {
    return { text: markdown, truncated: false }
  }

  const budget = LINEAR_DESCRIPTION_MAX_CHARS - TRUNCATION_NOTICE.length
  return {
    text: `${markdown.slice(0, Math.max(0, budget))}${TRUNCATION_NOTICE}`,
    truncated: true,
  }
}

export function suggestedAgentBranch(reportId: string): string {
  const slug = reportId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)
  return `cursor/crikket-${slug || "report"}`
}

export function buildMcpConnectionInstructions(input: {
  mcpUrl: string
}): string {
  return [
    "Connect a coding agent to this Crikket org over MCP:",
    "",
    "1. In Crikket, open **Settings → API Keys** and create a read-only org key (`crik_ak_…`).",
    "2. Store the secret in the agent environment. Never commit it.",
    "3. Cursor `mcp.json`:",
    "",
    "```json",
    JSON.stringify(
      {
        mcpServers: {
          crikket: {
            url: input.mcpUrl,
            headers: {
              Authorization: "Bearer crik_ak_YOUR_KEY_HERE",
            },
          },
        },
      },
      null,
      2
    ),
    "```",
    "",
    "Prefer `get_report_context` (or `GET /api/v1/reports/:id/context`) over paging individual events.",
  ].join("\n")
}

function repoLines(repo: LinearHandoffRepo | null, reportId: string): string[] {
  if (!repo) {
    return [
      "- Repository: not configured on this Crikket organization. An admin should set the GitHub repo in Settings → Linear.",
    ]
  }

  return [
    `- Repository: ${repo.githubRepoUrl}`,
    `- Base ref: \`${repo.githubRef || LINEAR_DEFAULT_GITHUB_REF}\``,
    `- Suggested branch: \`${suggestedAgentBranch(reportId)}\` (Cursor Cloud Agents default to a generated \`cursor/…\` branch from the base ref)`,
  ]
}

export function buildCompactAgentPrompt(input: {
  links: LinearHandoffLinks
  repo: LinearHandoffRepo | null
  reportId: string
  reportTitle: string
}): string {
  return [
    `Fix the bug described in Crikket report \`${input.reportId}\` (${input.reportTitle}).`,
    "",
    "Open a pull request with a focused, conservative change. Do not expand scope.",
    "",
    "## Links",
    "",
    `- Report: ${input.links.reportUrl}`,
    `- Agent context (JSON/Markdown): ${input.links.contextApiUrl}`,
    `- MCP: ${input.links.mcpUrl}`,
    ...repoLines(input.repo, input.reportId),
    "",
    "Use the report context in this Linear issue, or fetch the context API / MCP `get_report_context` tool.",
  ].join("\n")
}

export function buildLaunchAgentPrompt(input: {
  contextMarkdown: string
  links: LinearHandoffLinks
  repo: LinearHandoffRepo | null
  reportId: string
  reportTitle: string
}): string {
  const truncated = truncateLinearDescription(input.contextMarkdown)

  return [
    buildCompactAgentPrompt({
      links: input.links,
      repo: input.repo,
      reportId: input.reportId,
      reportTitle: input.reportTitle,
    }),
    "",
    "## Report context",
    "",
    truncated.text,
  ].join("\n")
}

export function buildHandoffSection(input: {
  agentPrompt: string
  launchCloudAgent: boolean
  links: LinearHandoffLinks
  repo: LinearHandoffRepo | null
  reportId: string
}): string {
  const repo = input.repo
  const branch = suggestedAgentBranch(input.reportId)
  const autoNote = input.launchCloudAgent
    ? "This organization launches a Cursor cloud agent automatically after the issue is created."
    : "Automatic Cursor cloud agent launch is **off**. Use the report UI **Launch agent** button, or paste the prompt into a Cursor cloud agent."

  return [
    "## Cloud agent handoff",
    "",
    autoNote,
    "",
    `- **Repo:** ${repo?.githubRepoUrl ?? "_not configured_"}`,
    `- **Base ref:** \`${repo?.githubRef || LINEAR_DEFAULT_GITHUB_REF}\``,
    `- **Suggested branch:** \`${branch}\``,
    `- **Report:** ${input.links.reportUrl}`,
    `- **Context API:** ${input.links.contextApiUrl}`,
    `- **MCP:** ${input.links.mcpUrl}`,
    "",
    "### MCP connection",
    "",
    buildMcpConnectionInstructions({ mcpUrl: input.links.mcpUrl }),
    "",
    "### Agent prompt",
    "",
    "```",
    input.agentPrompt,
    "```",
  ].join("\n")
}

export function buildLinearIssueDescription(input: {
  contextMarkdown: string
  launchCloudAgent: boolean
  links: LinearHandoffLinks
  repo: LinearHandoffRepo | null
  reportId: string
  reportTitle: string
}): BuiltHandoff {
  const title = truncateLinearTitle(input.reportTitle)
  const agentPrompt = buildCompactAgentPrompt({
    links: input.links,
    repo: input.repo,
    reportId: input.reportId,
    reportTitle: title,
  })
  const truncatedContext = truncateLinearDescription(input.contextMarkdown)
  const body = [
    `Crikket report [\`${input.reportId}\`](${input.links.reportUrl}) is ready.`,
    "",
    `- **Report:** ${input.links.reportUrl}`,
    `- **Context API:** ${input.links.contextApiUrl}?format=markdown`,
    "",
    "## Report context",
    "",
    truncatedContext.text,
    "",
    buildHandoffSection({
      agentPrompt,
      launchCloudAgent: input.launchCloudAgent,
      links: input.links,
      repo: input.repo,
      reportId: input.reportId,
    }),
  ].join("\n")

  const description = truncateLinearDescription(body)

  return {
    agentPrompt: buildLaunchAgentPrompt({
      contextMarkdown: input.contextMarkdown,
      links: input.links,
      repo: input.repo,
      reportId: input.reportId,
      reportTitle: title,
    }),
    description: description.text,
    title,
    truncated: truncatedContext.truncated || description.truncated,
  }
}

export function buildCursorAgentComment(input: {
  agentUrl: string
  reportUrl: string
}): string {
  return [
    "Cursor cloud agent launched from Crikket.",
    "",
    `- **Agent:** ${input.agentUrl}`,
    `- **Report:** ${input.reportUrl}`,
  ].join("\n")
}

const TRAILING_SLASHES = /\/+$/
const GIT_SUFFIX = /\.git$/i

export function normalizeGithubRepoUrl(value: string): string {
  return value.trim().replace(TRAILING_SLASHES, "").replace(GIT_SUFFIX, "")
}

export function isGithubRepoUrl(value: string): boolean {
  try {
    const parsed = new URL(normalizeGithubRepoUrl(value))
    if (parsed.protocol !== "https:") {
      return false
    }

    const host = parsed.hostname.toLowerCase()
    if (host !== "github.com" && host !== "www.github.com") {
      return false
    }

    const parts = parsed.pathname.split("/").filter(Boolean)
    return parts.length >= 2
  } catch {
    return false
  }
}

export function buildHandoffLinks(input: {
  appBaseUrl: string
  reportId: string
}): LinearHandoffLinks {
  const base = input.appBaseUrl.replace(TRAILING_SLASHES, "")
  return {
    contextApiUrl: `${base}/api/v1/reports/${input.reportId}/context`,
    mcpUrl: `${base}/mcp`,
    reportUrl: `${base}/s/${input.reportId}`,
  }
}
