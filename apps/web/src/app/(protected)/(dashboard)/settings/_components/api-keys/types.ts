import type { AppRouterClient } from "@crikket/api/routers/index"

export type OrganizationApiKeysSnapshot = Awaited<
  ReturnType<AppRouterClient["organizationApiKey"]["list"]>
>

export type OrganizationApiKeyItem = OrganizationApiKeysSnapshot[number]
