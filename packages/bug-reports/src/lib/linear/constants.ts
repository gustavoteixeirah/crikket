export const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql"
export const CURSOR_AGENTS_API_URL = "https://api.cursor.com/v1/agents"
export const CURSOR_AGENTS_API_DOCS_URL =
  "https://cursor.com/docs/cloud-agent/api/endpoints"

export const LINEAR_ISSUE_TITLE_MAX = 255
export const LINEAR_DESCRIPTION_MAX_CHARS = 100_000
export const LINEAR_REQUEST_TIMEOUT_MS = 15_000
export const LINEAR_MAX_ERROR_LENGTH = 2000
export const LINEAR_STALE_PROCESSING_MS = 5 * 60 * 1000
export const LINEAR_DEFAULT_BATCH = 10
export const LINEAR_MAX_ATTEMPTS = 8
export const LINEAR_DEFAULT_GITHUB_REF = "main"

export const LINEAR_HANDOFF_KIND = {
  createIssue: "create_issue",
  launchAgent: "launch_agent",
} as const

export type LinearHandoffKind =
  (typeof LINEAR_HANDOFF_KIND)[keyof typeof LINEAR_HANDOFF_KIND]

export const LINEAR_HANDOFF_STATUS = {
  pending: "pending",
  processing: "processing",
  completed: "completed",
  failed: "failed",
  deadLetter: "dead_letter",
  skipped: "skipped",
} as const

export type LinearHandoffStatus =
  (typeof LINEAR_HANDOFF_STATUS)[keyof typeof LINEAR_HANDOFF_STATUS]
