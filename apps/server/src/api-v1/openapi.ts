export const CRIKKET_API_V1_OPENAPI = {
  openapi: "3.0.3",
  info: {
    title: "Crikket organization API",
    version: "1.0.0",
    description:
      "Read-only machine API for bug reports and artifacts. Authenticate with an organization API key (`crik_ak_`) as a Bearer token. Keys are org-scoped; reports from other organizations are returned as 404.",
  },
  servers: [
    { url: "https://crikket.kodegt.com", description: "Production" },
    { url: "http://localhost:3000", description: "Local Hono server" },
  ],
  tags: [{ name: "Reports" }, { name: "Meta" }],
  paths: {
    "/api/v1/openapi.json": {
      get: {
        tags: ["Meta"],
        summary: "OpenAPI 3 document",
        security: [],
        responses: {
          "200": {
            description: "OpenAPI 3.0.3 document",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/v1/reports": {
      get: {
        tags: ["Reports"],
        summary: "List reports for the API key's organization",
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["open", "in_progress", "resolved", "closed"],
            },
          },
          {
            name: "createdAfter",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "createdBefore",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string", maxLength: 200 },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "perPage",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 20 },
          },
        ],
        responses: {
          "200": { description: "Paginated report list" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}": {
      get: {
        tags: ["Reports"],
        summary: "Get one report (truncated events, transcript, Linear link)",
        parameters: [{ $ref: "#/components/parameters/ReportId" }],
        responses: {
          "200": { description: "Report detail" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}/context": {
      get: {
        tags: ["Reports"],
        summary:
          "One-call agent-ready context package (transcript, Linear, timeline, media)",
        parameters: [
          { $ref: "#/components/parameters/ReportId" },
          {
            name: "format",
            in: "query",
            schema: {
              type: "string",
              enum: ["json", "markdown"],
              default: "json",
            },
          },
        ],
        responses: {
          "200": { description: "JSON package or paste-ready markdown" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}/events": {
      get: {
        tags: ["Reports"],
        summary: "Page actions, console logs, or network requests",
        parameters: [
          { $ref: "#/components/parameters/ReportId" },
          {
            name: "kind",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["actions", "logs", "network"] },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "perPage",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
          },
          {
            name: "search",
            in: "query",
            description:
              "Optional filter for network requests (method or URL).",
            schema: { type: "string", maxLength: 200 },
          },
        ],
        responses: {
          "200": { description: "Paginated events" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}/network/{requestId}": {
      get: {
        tags: ["Reports"],
        summary: "Get headers and bodies for one network request",
        parameters: [
          { $ref: "#/components/parameters/ReportId" },
          {
            name: "requestId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "Network request payload" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}/artifacts": {
      get: {
        tags: ["Reports"],
        summary: "15-minute signed URLs for video and screenshot",
        parameters: [{ $ref: "#/components/parameters/ReportId" }],
        responses: {
          "200": { description: "Signed artifact URLs" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
    "/api/v1/reports/{id}/download": {
      get: {
        tags: ["Reports"],
        summary:
          "Download a report JSON export, or redirect to a signed media URL",
        description:
          "Without `artifact`, returns a JSON export (`Content-Disposition: attachment`) of the agent context package. With `artifact=video` or `artifact=screenshot`, 302-redirects to a 15-minute signed URL.",
        parameters: [
          { $ref: "#/components/parameters/ReportId" },
          {
            name: "artifact",
            in: "query",
            schema: { type: "string", enum: ["video", "screenshot"] },
          },
        ],
        responses: {
          "200": { description: "JSON export of the report" },
          "302": { description: "Redirect to a signed media URL" },
          "400": { $ref: "#/components/responses/BadRequest" },
          "401": { $ref: "#/components/responses/Unauthorized" },
          "403": { $ref: "#/components/responses/Forbidden" },
          "404": { $ref: "#/components/responses/NotFound" },
          "429": { $ref: "#/components/responses/RateLimited" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      OrganizationApiKey: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "crik_ak_",
        description:
          "Organization API key from Settings → API Keys. Prefix `crik_ak_`. Read-only.",
      },
    },
    parameters: {
      ReportId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
      },
    },
    schemas: {
      ApiError: {
        type: "object",
        required: ["error", "message"],
        properties: {
          error: { type: "string" },
          message: { type: "string" },
        },
      },
    },
    responses: {
      BadRequest: {
        description: "Invalid query or path parameter",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      Unauthorized: {
        description: "Missing or invalid organization API key",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      Forbidden: {
        description: "API key is not allowed to read reports",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      NotFound: {
        description: "Report or resource not found in this organization",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
      RateLimited: {
        description: "Too many requests",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" },
          },
        },
      },
    },
  },
  security: [{ OrganizationApiKey: [] }],
} as const
