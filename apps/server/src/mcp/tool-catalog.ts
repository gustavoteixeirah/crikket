import type { McpToolDefinition } from "./protocol"

export const CRIKKET_MCP_TOOLS: McpToolDefinition[] = [
  {
    description:
      "List bug reports for the API key's organization. Supports status, date range, search, and pagination. Does not include signed artifact URLs.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        createdAfter: {
          description:
            "ISO-8601 timestamp; only reports created at or after this time.",
          type: "string",
        },
        createdBefore: {
          description:
            "ISO-8601 timestamp; only reports created at or before this time.",
          type: "string",
        },
        page: {
          description: "1-based page number. Default 1.",
          minimum: 1,
          type: "integer",
        },
        perPage: {
          description: "Page size. Default 20, max 50.",
          maximum: 50,
          minimum: 1,
          type: "integer",
        },
        search: {
          description:
            "Case-insensitive search across title, description, and URL.",
          maxLength: 200,
          type: "string",
        },
        status: {
          description: "Filter by report status.",
          enum: ["open", "in_progress", "resolved", "closed"],
          type: "string",
        },
      },
      type: "object",
    },
    name: "list_reports",
  },
  {
    description:
      "Get one report in the API key's organization: title, description, metadata (URL, browser, OS, viewport, timestamps, reporter), truncated steps/logs/network, ingestion status, and a transcript summary (status, text, segment count) when speech-to-text has run. Use list_report_events to page further.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        reportId: {
          description: "Bug report id from list_reports.",
          type: "string",
        },
      },
      required: ["reportId"],
      type: "object",
    },
    name: "get_report",
  },
  {
    description:
      "One-call agent-ready package: title, description, reporter/page/URL/env, transcript text plus transcriptMeta (status, segments, model), merged chronological timeline (errors and failed requests highlighted, omitted counts), 15-minute signed media URLs, and paste-ready markdown. Prefer this when prompting a fixing agent.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        reportId: {
          description: "Bug report id from list_reports.",
          type: "string",
        },
      },
      required: ["reportId"],
      type: "object",
    },
    name: "get_report_context",
  },
  {
    description:
      "Page through a report's user actions, console logs, or network requests. Use after get_report when pagination.hasNextPage is true.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        kind: {
          enum: ["actions", "logs", "network"],
          type: "string",
        },
        page: {
          minimum: 1,
          type: "integer",
        },
        perPage: {
          maximum: 200,
          minimum: 1,
          type: "integer",
        },
        reportId: {
          type: "string",
        },
        search: {
          description: "Optional filter for network requests (method or URL).",
          maxLength: 200,
          type: "string",
        },
      },
      required: ["kind", "reportId"],
      type: "object",
    },
    name: "list_report_events",
  },
  {
    description:
      "Get request/response headers and bodies for one network request on a report.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        reportId: {
          type: "string",
        },
        requestId: {
          type: "string",
        },
      },
      required: ["reportId", "requestId"],
      type: "object",
    },
    name: "get_network_request",
  },
  {
    description:
      "Get short-lived signed URLs for the report's video and/or screenshot artifacts. URLs expire in 15 minutes.",
    inputSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: false,
      properties: {
        reportId: {
          type: "string",
        },
      },
      required: ["reportId"],
      type: "object",
    },
    name: "get_report_artifacts",
  },
]
