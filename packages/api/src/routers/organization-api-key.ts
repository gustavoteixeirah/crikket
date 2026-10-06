import {
  createOrganizationApiKeyProcedure,
  listOrganizationApiKeysProcedure,
  revokeOrganizationApiKeyProcedure,
} from "@crikket/auth/procedures/organization-api-keys"

/**
 * Organization API keys for machine clients (MCP, and later REST in KOD-273).
 * Session-authenticated CRUD; the hashed key itself is verified separately.
 */
export const organizationApiKeyRouter = {
  create: createOrganizationApiKeyProcedure,
  list: listOrganizationApiKeysProcedure,
  revoke: revokeOrganizationApiKeyProcedure,
}
