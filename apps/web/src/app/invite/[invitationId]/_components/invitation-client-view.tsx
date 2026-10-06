"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import {
  type InvitationViewState,
  resolveInvitationView,
} from "@crikket/shared/lib/organization-invitation"
import { Button } from "@crikket/ui/components/ui/button"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useRouter } from "nextjs-toploader/app"
import { useState } from "react"
import { toast } from "sonner"
import { AuthShell } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { orpc } from "@/utils/orpc"

interface InvitationClientViewProps {
  invitationId: string
}

function formatRoleLabel(role: string): string {
  if (role.length === 0) {
    return role
  }

  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function InvitationClientView({
  invitationId,
}: InvitationClientViewProps) {
  const router = useRouter()
  const { data: session, isPending: isSessionPending } = authClient.useSession()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const callbackUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${invitationId}`

  const invitationQuery = useQuery(
    orpc.auth.getOrganizationInvitation.queryOptions({
      input: { invitationId },
    })
  )

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.organization.acceptInvitation({
        invitationId,
      })

      if (error) {
        throw error
      }

      const organizationId = data?.invitation?.organizationId

      if (organizationId) {
        const { error: setActiveError } =
          await authClient.organization.setActive({
            organizationId,
          })

        if (setActiveError) {
          throw setActiveError
        }
      }
    },
    onSuccess: () => {
      toast.success("Invitation accepted")
      router.push("/settings/organization")
      router.refresh()
    },
    onError: (error) => {
      toast.error(error.message ?? "Failed to accept invitation")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.organization.rejectInvitation({
        invitationId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Invitation declined")
      router.push("/settings/user")
      router.refresh()
    },
    onError: (error) => {
      toast.error(error.message ?? "Failed to reject invitation")
    },
  })

  const view = resolveInvitationView({
    invitation: invitationQuery.data
      ? {
          id: invitationQuery.data.id,
          email: invitationQuery.data.email,
          role: invitationQuery.data.role,
          status: invitationQuery.data.status,
          expiresAt: invitationQuery.data.expiresAt,
          organizationName: invitationQuery.data.organizationName,
        }
      : null,
    sessionEmail: session?.user.email ?? null,
  })

  const loginHref = `/login?email=${encodeURIComponent(
    view.kind === "needs-account" ||
      view.kind === "can-accept" ||
      view.kind === "wrong-email"
      ? view.invitedEmail
      : ""
  )}&callbackURL=${encodeURIComponent(callbackUrl)}`

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = `/invite/${invitationId}`
        },
      },
    })
    setIsSigningOut(false)
  }

  if (isSessionPending || invitationQuery.isPending) {
    return (
      <InvitationMessage
        description="Review and respond to this invitation."
        title="Organization Invitation"
      >
        Loading invitation...
      </InvitationMessage>
    )
  }

  if (invitationQuery.error) {
    return (
      <InvitationMessage
        description="This invitation could not be loaded."
        title="Organization Invitation"
      >
        {invitationQuery.error.message}
      </InvitationMessage>
    )
  }

  const unavailableMessage = getUnavailableInvitationMessage(view)
  if (unavailableMessage) {
    return <InvitationMessage {...unavailableMessage} />
  }

  if (!isActionableInvitationView(view)) {
    return (
      <InvitationMessage
        description="This invitation cannot be used."
        title="Invitation unavailable"
      >
        Ask an organization admin to send a new invite link.
      </InvitationMessage>
    )
  }

  if (view.kind === "wrong-email") {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <AuthShell
          description={`This invitation is for ${view.invitedEmail}.`}
          title="Wrong account"
        >
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              You are signed in as {view.sessionEmail}. Sign out and continue
              with the invited email to join {view.organizationName} as{" "}
              {formatRoleLabel(view.role)}.
            </p>
            <Button
              disabled={isSigningOut}
              onClick={() => {
                handleSignOut().catch(() => {
                  setIsSigningOut(false)
                })
              }}
              size="lg"
            >
              {isSigningOut ? "Signing out..." : "Sign out to continue"}
            </Button>
          </div>
        </AuthShell>
      </main>
    )
  }

  if (view.kind === "needs-account") {
    return (
      <main className="flex min-h-svh items-center justify-center">
        <SignUpForm
          callbackURL={callbackUrl}
          description={`Create an account for ${view.invitedEmail} to join ${view.organizationName} as ${formatRoleLabel(view.role)}.`}
          lockedEmail={view.invitedEmail}
          onAccountCreated={async () => {
            await acceptMutation.mutateAsync()
          }}
          redirectWhenAuthenticated={false}
          signInHref={loginHref}
          submitLabel="Create account and join"
          title={`Join ${view.organizationName}`}
        />
      </main>
    )
  }

  return (
    <main className="flex min-h-svh items-center justify-center">
      <AuthShell
        description={`Join ${view.organizationName} as ${formatRoleLabel(view.role)}.`}
        title="Organization Invitation"
      >
        <p className="text-muted-foreground text-sm">
          This invitation was sent to {view.invitedEmail}.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="sm:flex-1"
            disabled={acceptMutation.isPending || rejectMutation.isPending}
            onClick={() => acceptMutation.mutate()}
            size="lg"
          >
            {acceptMutation.isPending ? "Accepting..." : "Accept invitation"}
          </Button>
          <Button
            className="sm:flex-1"
            disabled={acceptMutation.isPending || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
            size="lg"
            variant="outline"
          >
            {rejectMutation.isPending ? "Declining..." : "Decline"}
          </Button>
        </div>
      </AuthShell>
    </main>
  )
}

type ActionableInvitationView = Extract<
  InvitationViewState,
  { kind: "wrong-email" | "needs-account" | "can-accept" }
>

function isActionableInvitationView(
  view: InvitationViewState
): view is ActionableInvitationView {
  return (
    view.kind === "wrong-email" ||
    view.kind === "needs-account" ||
    view.kind === "can-accept"
  )
}

function getUnavailableInvitationMessage(
  view: InvitationViewState
): { title: string; description: string; children: string } | null {
  if (view.kind === "not-found") {
    return {
      title: "Invitation not found",
      description: "This invitation could not be found.",
      children: "Ask an organization admin to send a new invite link.",
    }
  }

  if (
    view.kind === "canceled" ||
    view.kind === "rejected" ||
    view.kind === "unavailable"
  ) {
    return {
      title: "Invitation unavailable",
      description: "This invitation is no longer valid.",
      children: "Ask an organization admin to send a new invite link.",
    }
  }

  if (view.kind === "accepted") {
    return {
      title: "Invitation already accepted",
      description: "This invitation has already been accepted.",
      children:
        "Sign in with the invited email if you already joined the organization.",
    }
  }

  if (view.kind === "expired") {
    return {
      title: "Invitation expired",
      description: `The invitation to join ${view.organizationName} has expired.`,
      children: `Ask an organization admin to create a new invite for ${view.invitedEmail}.`,
    }
  }

  return null
}

function InvitationMessage({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: string
}) {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <AuthShell description={description} title={title}>
        <p className="text-muted-foreground text-sm">{children}</p>
      </AuthShell>
    </main>
  )
}
