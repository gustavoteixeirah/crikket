import { authClient } from "@crikket/auth/client"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { getProtectedAuthData } from "@/app/(protected)/_lib/get-protected-auth-data"
import { client } from "@/utils/orpc"

import { ApiKeysManagement } from "../_components/api-keys/api-keys-management"
import { getRequestErrorMessage } from "../_lib/get-request-error-message"

export const metadata: Metadata = {
  title: "API Keys Settings",
  description:
    "Create and revoke organization API keys for MCP and machine access.",
}

export default async function OrganizationApiKeysSettingsPage() {
  const { organizations, session } = await getProtectedAuthData()

  if (!session) {
    redirect("/login")
  }

  if (organizations.length === 0) {
    redirect("/onboarding")
  }

  const activeOrganization =
    organizations.find(
      (organization) => organization.id === session.session.activeOrganizationId
    ) ?? organizations[0]

  const requestHeaders = await headers()
  const authFetchOptions = {
    fetchOptions: {
      headers: requestHeaders,
    },
  }

  const { data: memberRoleData } =
    await authClient.organization.getActiveMemberRole({
      query: {
        organizationId: activeOrganization.id,
      },
      ...authFetchOptions,
    })

  const canManage =
    memberRoleData?.role === "owner" || memberRoleData?.role === "admin"
  const apiKeysState = canManage
    ? await client.organizationApiKey
        .list()
        .then((data) => ({
          data,
          error: null,
        }))
        .catch((error) => ({
          data: [] as Awaited<
            ReturnType<typeof client.organizationApiKey.list>
          >,
          error,
        }))
    : {
        data: [] as Awaited<ReturnType<typeof client.organizationApiKey.list>>,
        error: null,
      }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">API Keys</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Issue read-only organization keys so coding agents can list and fetch
          reports over MCP for {activeOrganization.name}.
        </p>
      </div>

      {canManage ? (
        <ApiKeysManagement
          canManage={canManage}
          initialKeys={apiKeysState.data}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Only organization admins and owners can manage API keys.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Ask an organization admin to create a key for your agent.
          </CardContent>
        </Card>
      )}

      {apiKeysState.error ? (
        <p className="text-destructive text-sm">
          Failed to load API keys: {getRequestErrorMessage(apiKeysState.error)}
        </p>
      ) : null}
    </div>
  )
}
