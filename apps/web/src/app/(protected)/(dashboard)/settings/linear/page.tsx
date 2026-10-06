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

import { LinearSettings } from "../_components/linear/linear-settings"
import { getRequestErrorMessage } from "../_lib/get-request-error-message"

export const metadata: Metadata = {
  title: "Linear integration",
  description:
    "Create a Linear issue when a Crikket report is ready, with a Cursor cloud agent handoff.",
}

export default async function LinearSettingsPage() {
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
  const linearState = canManage
    ? await client.linear
        .get()
        .then((data) => ({
          data,
          error: null,
        }))
        .catch((error) => ({
          data: {
            integration: null,
          },
          error,
        }))
    : {
        data: {
          integration: null,
        },
        error: null,
      }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">
          Linear integration
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Map {activeOrganization.name} to a Linear team and project. When a
          report is ready, Crikket can open an issue with the agent context
          package.
        </p>
      </div>

      {canManage ? (
        <LinearSettings
          canManage={canManage}
          initialIntegration={linearState.data.integration}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Only organization admins and owners can manage the Linear
              integration.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Ask an organization admin to add a Linear API key and pick the team
            and project for this product.
          </CardContent>
        </Card>
      )}

      {linearState.error ? (
        <p className="text-destructive text-sm">
          Failed to load Linear settings:{" "}
          {getRequestErrorMessage(linearState.error)}
        </p>
      ) : null}
    </div>
  )
}
