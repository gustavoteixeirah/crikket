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

import { TranscriptionSettings } from "../_components/transcription/transcription-settings"
import { getRequestErrorMessage } from "../_lib/get-request-error-message"

export const metadata: Metadata = {
  title: "Transcription Settings",
  description:
    "Optional OpenAI speech-to-text for report video audio. Bring your own key.",
}

export default async function TranscriptionSettingsPage() {
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
  const transcriptionState = canManage
    ? await client.transcription
        .get()
        .then((data) => ({
          data,
          error: null,
        }))
        .catch((error) => ({
          data: {
            configurable: false,
            configurationError: getRequestErrorMessage(error),
            settings: null,
          },
          error,
        }))
    : {
        data: {
          configurable: true,
          configurationError: null,
          settings: null,
        },
        error: null,
      }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-xl tracking-tight">Transcription</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Optional OpenAI speech-to-text for video reports in{" "}
          {activeOrganization.name}. The API key is stored encrypted and never
          shown again after save.
        </p>
      </div>

      {canManage ? (
        <TranscriptionSettings
          canManage={canManage}
          initialState={transcriptionState.data}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Only organization admins and owners can manage transcription.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Ask an organization admin to add an OpenAI API key in Settings →
            Transcription.
          </CardContent>
        </Card>
      )}

      {transcriptionState.error ? (
        <p className="text-destructive text-sm">
          Failed to load transcription settings:{" "}
          {getRequestErrorMessage(transcriptionState.error)}
        </p>
      ) : null}
    </div>
  )
}
