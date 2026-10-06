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

import { WebhookSettings } from "../_components/webhooks/webhook-settings"
import { getRequestErrorMessage } from "../_lib/get-request-error-message"

export const metadata: Metadata = {
  title: "Webhook Settings",
  description:
    "Send signed report.ready events to n8n, Slack, or an AI agent after ingest.",
}

export default async function WebhookSettingsPage() {
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
  const webhookState = canManage
    ? await client.webhook
        .get()
        .then((data) => ({
          data,
          error: null,
        }))
        .catch((error) => ({
          data: {
            deliveries: [],
            endpoint: null,
          },
          error,
        }))
    : {
        data: {
          deliveries: [],
          endpoint: null,
        },
        error: null,
      }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">Webhooks</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Notify n8n, Slack, or an agent when a bug report finishes ingest for{" "}
          {activeOrganization.name}.
        </p>
      </div>

      {canManage ? (
        <WebhookSettings
          canManage={canManage}
          initialDeliveries={webhookState.data.deliveries}
          initialEndpoint={webhookState.data.endpoint}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Only organization admins and owners can manage outbound webhooks.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Ask an organization admin to configure a webhook URL and signing
            secret.
          </CardContent>
        </Card>
      )}

      {webhookState.error ? (
        <p className="text-destructive text-sm">
          Failed to load webhook settings:{" "}
          {getRequestErrorMessage(webhookState.error)}
        </p>
      ) : null}
    </div>
  )
}
