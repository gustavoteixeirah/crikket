"use client"

import { authClient } from "@crikket/auth/client"
import { env } from "@crikket/env/web"
import { buildOrganizationInvitationUrl } from "@crikket/shared/lib/organization-invitation"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@crikket/ui/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@crikket/ui/components/ui/card"
import { Input } from "@crikket/ui/components/ui/input"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "nextjs-toploader/app"
import { useState } from "react"
import { toast } from "sonner"

import { client } from "@/utils/orpc"
import { CopyValueButton } from "../public-keys/components/copy-value-button"
import { InviteMemberForm } from "./invite-member-form"
import { MembersTable } from "./members-table"
import { PendingInvitations } from "./pending-invitations"
import type {
  OrganizationInvitationRow,
  OrganizationMemberRow,
  OrganizationRole,
} from "./types"

interface OrganizationMembersSectionProps {
  organizationId: string
  currentPlan: "free" | "pro" | "studio"
  currentUserId: string
  currentUserRole: OrganizationRole
  invitationEmailEnabled: boolean
  memberCap: number | null
  members: OrganizationMemberRow[]
  totalMembers: number
  pendingInvitations: OrganizationInvitationRow[]
}

function canManageMembers(role: OrganizationRole): boolean {
  return role === "owner" || role === "admin"
}

function getErrorMessage(
  error: { message?: string } | null | undefined,
  fallback: string
): string {
  return error?.message ?? fallback
}

function invitationRole(
  role: OrganizationRole | undefined
): "admin" | "member" {
  return role === "admin" ? "admin" : "member"
}

export function OrganizationMembersSection({
  organizationId,
  currentPlan,
  currentUserId,
  currentUserRole,
  invitationEmailEnabled,
  memberCap,
  members,
  totalMembers,
  pendingInvitations,
}: OrganizationMembersSectionProps) {
  const router = useRouter()
  const canManage = canManageMembers(currentUserRole)
  const hasReachedMemberCap =
    typeof memberCap === "number" && totalMembers >= memberCap
  const canInviteMembers = canManage && !hasReachedMemberCap
  const [createdInvite, setCreatedInvite] = useState<{
    email: string
    inviteUrl: string
  } | null>(null)

  const inviteMemberMutation = useMutation({
    mutationFn: async (input: {
      email: string
      role: "admin" | "member"
      resend?: boolean
    }) => {
      const { data, error } = await authClient.organization.inviteMember({
        organizationId,
        email: input.email,
        role: input.role,
        resend: input.resend,
      })

      if (error) {
        throw error
      }

      const invitationId = data?.id
      if (!invitationId) {
        throw new Error("Invitation was created without an id.")
      }

      return {
        email: input.email,
        inviteUrl: buildOrganizationInvitationUrl(
          env.NEXT_PUBLIC_APP_URL,
          invitationId
        ),
      }
    },
    onSuccess: (created, input) => {
      setCreatedInvite(created)
      if (invitationEmailEnabled) {
        toast.success(input.resend ? "Invitation resent" : "Invitation sent")
      } else {
        toast.success(
          input.resend ? "Invite link ready again" : "Invitation created"
        )
      }
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to invite member"))
    },
  })

  const addExistingMemberMutation = useMutation({
    mutationFn: (input: { email: string; role: "admin" | "member" }) =>
      client.auth.addExistingOrganizationMember({
        organizationId,
        email: input.email,
        role: input.role,
      }),
    onSuccess: () => {
      setCreatedInvite(null)
      toast.success("Member added")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to add member"))
    },
  })

  const updateMemberRoleMutation = useMutation({
    mutationFn: async (input: {
      memberId: string
      role: "admin" | "member"
    }) => {
      const { error } = await authClient.organization.updateMemberRole({
        organizationId,
        memberId: input.memberId,
        role: input.role,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Member role updated")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to update member role"))
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await authClient.organization.removeMember({
        organizationId,
        memberIdOrEmail: memberId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Member removed")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to remove member"))
    },
  })

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await authClient.organization.cancelInvitation({
        invitationId,
      })

      if (error) {
        throw error
      }
    },
    onSuccess: () => {
      toast.success("Invitation revoked")
      router.refresh()
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Failed to revoke invitation"))
    },
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Invite Members</CardTitle>
          <CardDescription>
            Create an invite link to share manually. Email is sent only when an
            email provider is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InviteMemberForm
            canInviteMembers={canInviteMembers}
            invitationEmailEnabled={invitationEmailEnabled}
            isAddingExisting={addExistingMemberMutation.isPending}
            isInviting={inviteMemberMutation.isPending}
            onAddExistingMember={async (input) => {
              await addExistingMemberMutation.mutateAsync(input)
            }}
            onInviteMember={async (input) => {
              await inviteMemberMutation.mutateAsync(input)
            }}
          />
          {canManage ? null : (
            <p className="text-muted-foreground text-sm">
              Only admins can invite new members.
            </p>
          )}
          {hasReachedMemberCap ? (
            <p className="text-muted-foreground text-sm">
              {currentPlan === "pro"
                ? "Pro plan member limit reached. Upgrade to Studio to invite more teammates."
                : "Member limit reached for this organization plan."}
            </p>
          ) : null}
          {invitationEmailEnabled ? null : (
            <p className="text-muted-foreground text-sm">
              No email provider is configured, so invitations are not sent by
              email. Copy the invite link and share it with the teammate.
            </p>
          )}
          {createdInvite ? (
            <Alert>
              <AlertTitle>Invite link for {createdInvite.email}</AlertTitle>
              <AlertDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Input
                    aria-label="Invite link"
                    readOnly
                    value={createdInvite.inviteUrl}
                  />
                  <CopyValueButton
                    ariaLabel="Copy invite link"
                    value={createdInvite.inviteUrl}
                    variant="outline"
                  />
                </div>
                <p className="mt-2">
                  {invitationEmailEnabled
                    ? "An email was also sent when delivery succeeded."
                    : "No email was sent. Share this link with the invitee."}
                </p>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <MembersTable
        management={{
          canManageMembers: canManage,
          currentUserId,
          updatingMemberId: updateMemberRoleMutation.isPending
            ? (updateMemberRoleMutation.variables?.memberId ?? null)
            : null,
          removingMemberId: removeMemberMutation.isPending
            ? (removeMemberMutation.variables ?? null)
            : null,
          onUpdateMemberRole: (memberId, role) =>
            updateMemberRoleMutation.mutateAsync({ memberId, role }),
          onRemoveMember: (memberId) =>
            removeMemberMutation.mutateAsync(memberId),
        }}
        members={members}
        totalMembers={totalMembers}
      />

      <PendingInvitations
        cancelingInvitationId={
          cancelInvitationMutation.isPending
            ? (cancelInvitationMutation.variables ?? null)
            : null
        }
        canManageMembers={canManage}
        invitations={pendingInvitations}
        onCancelInvitation={async (invitationId) => {
          await cancelInvitationMutation.mutateAsync(invitationId)
        }}
        onResendInvitation={async (invitation) => {
          await inviteMemberMutation.mutateAsync({
            email: invitation.email,
            role: invitationRole(invitation.role),
            resend: true,
          })
        }}
        resendingInvitationId={
          inviteMemberMutation.isPending &&
          inviteMemberMutation.variables?.resend
            ? (pendingInvitations.find(
                (invitation) =>
                  invitation.email.toLowerCase() ===
                  inviteMemberMutation.variables?.email.toLowerCase()
              )?.invitationId ?? null)
            : null
        }
      />
    </div>
  )
}
